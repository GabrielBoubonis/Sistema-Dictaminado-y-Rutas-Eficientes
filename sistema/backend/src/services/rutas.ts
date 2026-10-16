import { prisma, type Tx } from '../db';
import { AppError } from '../errors';
import { config } from '../config';
import { providers, ProveedorNoDisponible, haversine, type Coord, type Modo, type MatrizResultado } from '../providers';

const DIA_MS = 24 * 3600 * 1000;
const FRANJA_MS = 2 * DIA_MS; // franjas de antigüedad de 2 días corridos (arquitectura §5)
// OpenRouteService gratuito admite hasta 3500 pares por matriz: 59 × 59 = 3481 (la partida + 58 candidatas).
const MAX_PUNTOS_MATRIZ = 59;
/** Más lejos que esto de la sede, la ubicación informada no se usa (GPS erróneo o fuera de Rosario). */
const MAX_DISTANCIA_PARTIDA_M = 30_000;
/** Clave del bloqueo de PostgreSQL que ordena las reservas de rutas de a una (RNF-02). */
const BLOQUEO_RESERVAS = 4801;
class Recalcular extends Error {}

export type Poligono = Array<[number, number]>; // [lat, lng]

/** Punto en polígono (ray casting) sobre [lat, lng]. */
export function puntoEnPoligono(p: Coord, poly: Poligono): boolean {
  let dentro = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i], [yj, xj] = poly[j];
    if (yi > p.lat !== yj > p.lat && p.lng < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

/** 18:00 hs de Argentina (UTC-3 fijo) = 21:00 UTC. Devuelve el último corte ocurrido antes de `ahora`. */
export function ultimoCorte(ahora: Date): Date {
  const c = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate(), 21, 0, 0));
  return c <= ahora ? c : new Date(c.getTime() - DIA_MS);
}

export interface SolicitudCandidata {
  numero_sua: string; anio: number; prioridad: string; latitud: number; longitud: number; fecha_ultima_derivacion: Date;
}
const clave = (s: { numero_sua: string; anio: number }) => `${s.numero_sua}-${s.anio}`;

/** Agrupa por franjas de 2 días corridos, de la más antigua a la más nueva. */
export function agruparPorFranja<T extends { fecha_ultima_derivacion: Date }>(items: T[]): T[][] {
  if (!items.length) return [];
  const orden = [...items].sort((a, b) => a.fecha_ultima_derivacion.getTime() - b.fecha_ultima_derivacion.getTime());
  const base = orden[0].fecha_ultima_derivacion.getTime();
  const franjas: T[][] = [];
  for (const it of orden) {
    const idx = Math.floor((it.fecha_ultima_derivacion.getTime() - base) / FRANJA_MS);
    (franjas[idx] ??= []).push(it);
  }
  return franjas.filter(Boolean);
}

/**
 * RF-47: elige `cupo` candidatas. Franjas de la más antigua a la más nueva; dentro de cada franja, vecino más
 * próximo respecto del punto ya seleccionado más cercano (acumulativo; el primero, respecto de la partida).
 * `dist` puede ser null (ORS caído): entonces solo cuenta la antigüedad.
 */
export function seleccionar<T extends SolicitudCandidata>(
  candidatas: T[], cupo: number, dist: ((a: T | 'partida', b: T) => number) | null, previas: T[] = [],
): T[] {
  const elegidas: T[] = [];
  for (const franja of agruparPorFranja(candidatas)) {
    const resto = [...franja];
    while (resto.length && elegidas.length < cupo) {
      let mejor = 0;
      if (dist) {
        const ancla = [...previas, ...elegidas];
        let mejorD = Infinity;
        resto.forEach((c, i) => {
          const d = ancla.length ? Math.min(...ancla.map((a) => dist(a, c))) : dist('partida', c);
          if (d < mejorD) { mejorD = d; mejor = i; }
        });
      }
      elegidas.push(resto.splice(mejor, 1)[0]);
    }
    if (elegidas.length >= cupo) break;
  }
  return elegidas;
}

/** RF-48: orden de visita por vecino más próximo desde la partida, sin regreso. Devuelve índices de `idx` (matriz: 0 = partida). */
export function ordenarVisita(m: MatrizResultado, n: number, idxMatriz: number[]): { orden: number[]; distancia: number; tiempo: number } {
  const pend = new Set(Array.from({ length: n }, (_, i) => i));
  const orden: number[] = [];
  let actual = 0, distancia = 0, tiempo = 0;
  while (pend.size) {
    let mejor = -1, mejorD = Infinity;
    for (const i of pend) {
      const d = m.distancias[actual][idxMatriz[i]];
      if (d < mejorD) { mejorD = d; mejor = i; }
    }
    distancia += m.distancias[actual][idxMatriz[mejor]]; tiempo += m.duraciones[actual][idxMatriz[mejor]];
    actual = idxMatriz[mejor]; pend.delete(mejor); orden.push(mejor);
  }
  return { orden, distancia, tiempo }; // termina en la última solicitud: los ingenieros no vuelven a la sede
}

export type TipoPartida = 'Ubicación actual' | 'Sede';
/** Partida de la ruta: la ubicación actual del ingeniero si la dio y es plausible; si no, la sede (Mariano Moreno 2350). */
export function resolverPartida(ubicacion?: Coord): Coord & { tipo: TipoPartida } {
  const sede = config.sede;
  if (ubicacion && haversine(ubicacion, sede) <= MAX_DISTANCIA_PARTIDA_M) return { ...ubicacion, tipo: 'Ubicación actual' };
  return { ...sede, tipo: 'Sede' };
}

export interface ParametrosRuta {
  usuario: string;
  modo: Modo;
  tipo: 'Normal' | 'Tormenta';
  distrito?: string;
  zona?: Poligono;
  /** Normal: cantidad por prioridad (se suman). Tormenta: solo `total`. */
  cantidades?: Partial<Record<'Alta' | 'Media' | 'Baja', number>>;
  total?: number;
  /** Ubicación actual del ingeniero (GPS del captor); sin ella se parte de la sede. */
  ubicacion?: Coord;
}

/** Libera las reservas vencidas (RF-17, corte de las 18:00). Idempotente; se invoca al operar y por un temporizador. */
export async function cerrarRutasVencidas(ahora = new Date()): Promise<number> {
  const corte = ultimoCorte(ahora);
  const vencidas = await prisma.ruta.findMany({ where: { estado: 'Activa', creada: { lt: corte } } });
  for (const r of vencidas) {
    await prisma.$transaction(async (tx) => {
      await tx.rutaSolicitud.updateMany({
        where: { id_ruta: r.id_ruta, liberada: false },
        data: { liberada: true, fecha_liberacion: ahora, motivo_liberacion: 'Corte de las 18:00' },
      });
      await tx.ruta.update({ where: { id_ruta: r.id_ruta }, data: { estado: 'Vencida' } });
    });
  }
  return vencidas.length;
}

/** RF-17: libera la reserva de una solicitud cuando se dictamina y cierra la ruta si ya no queda trabajo. */
export async function liberarPorDictamen(tx: Tx, numeroSua: string, anio: number) {
  const reservas = await tx.rutaSolicitud.findMany({ where: { numero_sua: numeroSua, anio, liberada: false } });
  for (const r of reservas) {
    await tx.rutaSolicitud.update({
      where: { id_ruta_numero_sua_anio: { id_ruta: r.id_ruta, numero_sua: numeroSua, anio } },
      data: { liberada: true, fecha_liberacion: new Date(), motivo_liberacion: 'Dictaminada' },
    });
    const quedan = await tx.rutaSolicitud.count({ where: { id_ruta: r.id_ruta, liberada: false } });
    if (quedan === 0) await tx.ruta.update({ where: { id_ruta: r.id_ruta }, data: { estado: 'Completada' } });
  }
}

export async function rutaActivaDe(usuario: string) {
  return prisma.ruta.findFirst({ where: { nombre_usuario: usuario, estado: 'Activa' }, orderBy: { creada: 'desc' } });
}

export async function generarRuta(p: ParametrosRuta) {
  await cerrarRutasVencidas();
  if (await rutaActivaDe(p.usuario)) {
    throw new AppError(409, 'ruta_activa_existente', 'Ya tenés una ruta activa. Restablecela antes de generar otra.');
  }
  const partida = resolverPartida(p.ubicacion);

  for (let intento = 0; intento < 5; intento++) {
    // RF-16: se excluyen las reservadas por cualquier ruta activa; sin coordenadas quedan afuera (RF-62).
    const reservadas = await prisma.rutaSolicitud.findMany({ where: { liberada: false }, select: { numero_sua: true, anio: true } });
    const excluidas = new Set(reservadas.map(clave));
    const todas = await prisma.solicitud.findMany({
      where: {
        estado: { in: ['Pendiente', 'Pendiente-revisión'] }, es_tormenta: p.tipo === 'Tormenta',
        latitud: { not: null }, longitud: { not: null },
        dictamenes: { none: { vigente: null } }, // los casos con conflicto esperan la decisión de un Jefe (RF-59)
        ...(p.distrito ? { distrito: p.distrito } : {}),
      },
    });
    const candidatas = todas
      .filter((s) => !excluidas.has(clave(s)))
      .filter((s) => !p.zona || puntoEnPoligono({ lat: s.latitud!, lng: s.longitud! }, p.zona))
      .map((s) => ({ ...s, latitud: s.latitud!, longitud: s.longitud! }));

    // Grupos a llenar: por prioridad (normal) o uno solo (tormenta).
    const grupos: Array<{ items: typeof candidatas; cupo: number }> = p.tipo === 'Tormenta'
      ? [{ items: candidatas, cupo: p.total ?? 0 }]
      : (['Alta', 'Media', 'Baja'] as const).map((pr) => ({ items: candidatas.filter((c) => c.prioridad === pr), cupo: p.cantidades?.[pr] ?? 0 }))
          .filter((g) => g.cupo > 0);

    // Pool para la matriz: partida + candidatas de las franjas necesarias (acotado).
    const pool: typeof candidatas = [];
    for (const g of grupos) {
      let n = 0;
      for (const f of agruparPorFranja(g.items)) { pool.push(...f); n += f.length; if (n >= g.cupo) break; }
    }
    const poolAcotado = pool.slice(0, MAX_PUNTOS_MATRIZ - 1);
    const idxPool = new Map(poolAcotado.map((c, i) => [clave(c), i + 1]));

    let matriz: MatrizResultado | null = null;
    if (poolAcotado.length) {
      try { matriz = await providers.matriz.matriz([{ lat: partida.lat, lng: partida.lng }, ...poolAcotado.map((c) => ({ lat: c.latitud, lng: c.longitud }))], p.modo); }
      catch (e) { if (!(e instanceof ProveedorNoDisponible)) console.error('Error de matriz:', e); matriz = null; }
    }
    const dist = matriz
      ? (a: any, b: any) => matriz!.distancias[a === 'partida' ? 0 : idxPool.get(clave(a))!][idxPool.get(clave(b))!]
      : null;

    // Elegir y reservar de a un ingeniero por vez (RNF-02). Lo lento (leer candidatas y consultar la matriz) ya se hizo
    // afuera; adentro del bloqueo solo se releen las reservas, se elige sobre la matriz ya calculada y se inserta: son
    // milisegundos, así que siete ingenieros generando a la vez no se pisan ni esperan de forma perceptible.
    try {
      return await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${BLOQUEO_RESERVAS})`;
        if (await tx.ruta.findFirst({ where: { nombre_usuario: p.usuario, estado: 'Activa' } })) {
          throw new AppError(409, 'ruta_activa_existente', 'Ya tenés una ruta activa. Restablecela antes de generar otra.');
        }
        const ahora = await tx.rutaSolicitud.findMany({ where: { liberada: false }, select: { numero_sua: true, anio: true } });
        const tomadas = new Set(ahora.map(clave));
        const elegidas: typeof candidatas = [];
        for (const g of grupos) {
          const libres = g.items.filter((c) => !tomadas.has(clave(c)));
          const usables = dist ? libres.filter((c) => idxPool.has(clave(c))) : libres;
          // Otra ruta se llevó parte de lo calculado y hay libres fuera de la matriz: hay que recalcular.
          if (usables.length < Math.min(g.cupo, libres.length)) throw new Recalcular();
          elegidas.push(...seleccionar(usables, g.cupo, dist, elegidas));
        }
        if (!elegidas.length) throw new AppError(422, 'sin_solicitudes', 'No hay solicitudes disponibles con esos criterios');

        // Orden de visita (RF-48)
        let ordenFinal = elegidas; let distancia: number | null = null, tiempo: number | null = null; let optimizada = false;
        if (matriz) {
          const r = ordenarVisita(matriz, elegidas.length, elegidas.map((c) => idxPool.get(clave(c))!));
          ordenFinal = r.orden.map((i) => elegidas[i]); distancia = r.distancia; tiempo = r.tiempo; optimizada = true;
        }
        const ruta = await tx.ruta.create({
          data: {
            nombre_usuario: p.usuario, fecha: new Date(), tipo: p.tipo, modo_desplazamiento: p.modo,
            criterios: { distrito: p.distrito ?? null, zona: p.zona ?? null, cantidades: p.cantidades ?? null, total: p.total ?? null } as object,
            distancia_total_m: distancia, tiempo_total_s: tiempo, optimizada,
            partida_tipo: partida.tipo, partida_latitud: partida.lat, partida_longitud: partida.lng,
          },
        });
        await tx.rutaSolicitud.createMany({
          data: ordenFinal.map((s, i) => ({ id_ruta: ruta.id_ruta, numero_sua: s.numero_sua, anio: s.anio, orden: i + 1 })),
        });
        return ruta;
      });
    } catch (e: any) {
      if (e instanceof Recalcular) continue;
      // El índice único parcial sigue siendo la última defensa (p. ej. otra instancia del servidor sin el bloqueo).
      if (e?.code === 'P2002' || /uq_reserva_activa|duplicate key/i.test(String(e?.message))) continue;
      throw e;
    }
  }
  throw new AppError(409, 'conflicto_reserva', 'Otra ruta tomó esas solicitudes al mismo tiempo. Probá de nuevo.');
}

export async function detalleRuta(idRuta: number) {
  const ruta = await prisma.ruta.findUniqueOrThrow({
    where: { id_ruta: idRuta },
    include: { solicitudes: { orderBy: { orden: 'asc' }, include: { solicitud: true } } },
  });
  const { solicitudes, partida_tipo, partida_latitud, partida_longitud, ...datos } = ruta;
  return {
    ...datos,
    // Rutas creadas antes de guardar la partida: partían de la sede.
    partida: { tipo: partida_tipo, lat: partida_latitud ?? config.sede.lat, lng: partida_longitud ?? config.sede.lng },
    solicitudes: solicitudes.map((rs) => ({
      orden: rs.orden, liberada: rs.liberada, motivo_liberacion: rs.motivo_liberacion,
      numero_sua: rs.numero_sua, anio: rs.anio, direccion: rs.solicitud.direccion, distrito: rs.solicitud.distrito,
      prioridad: rs.solicitud.prioridad, latitud: rs.solicitud.latitud, longitud: rs.solicitud.longitud,
      estado: rs.solicitud.estado, descripcion_reclamo: rs.solicitud.descripcion_reclamo,
    })),
  };
}

export async function restablecerRuta(idRuta: number, usuario: string) {
  const ruta = await prisma.ruta.findUnique({ where: { id_ruta: idRuta } });
  if (!ruta || ruta.nombre_usuario !== usuario) throw new AppError(404, 'ruta_no_encontrada');
  if (ruta.estado !== 'Activa') throw new AppError(409, 'ruta_no_activa', 'La ruta ya no está activa');
  const liberadas = await prisma.$transaction(async (tx) => {
    const r = await tx.rutaSolicitud.updateMany({
      where: { id_ruta: idRuta, liberada: false },
      data: { liberada: true, fecha_liberacion: new Date(), motivo_liberacion: 'Restablecida' },
    });
    await tx.ruta.update({ where: { id_ruta: idRuta }, data: { estado: 'Restablecida' } });
    return r.count;
  });
  return { liberadas };
}

export { haversine };
