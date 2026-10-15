import { prisma, type Tx } from '../db';
import { z } from 'zod';
import { providers } from '../providers';
import { catalogos } from '../catalogos';

/** RNF-18: esquema esperado de cada registro del SUA (tipo, largo y caracteres permitidos). */
const sinControl = /^[^\u0000-\u001f<>{}\\]*$/;
const registroSuaSchema = z.object({
  numero_sua: z.string().regex(/^[0-9A-Za-z-]{1,20}$/, 'número de SUA inválido'),
  anio: z.number().int().min(2000).max(2100),
  distrito: z.enum(catalogos.distritos as [string, ...string[]], { errorMap: () => ({ message: 'no pertenece a la lista de distritos' }) }),
  prioridad: z.enum(catalogos.nivel_prioridad as [string, ...string[]], { errorMap: () => ({ message: 'no pertenece a los niveles de prioridad' }) }),
  direccion: z.string().trim().min(3).max(200).regex(sinControl, 'caracteres no permitidos'),
  descripcion_reclamo: z.string().max(1000).regex(sinControl, 'caracteres no permitidos'),
  es_tormenta: z.boolean(),
  es_rederivacion: z.boolean(),
  fecha_derivacion: z.date(),
}).passthrough();

async function registrarCasoInvalido(ref: string, motivo: string) {
  const ya = await prisma.casoRevision.findFirst({ where: { tipo: 'Datos inválidos del SUA', referencia_solicitud: ref, motivo } });
  if (!ya) await prisma.casoRevision.create({ data: { tipo: 'Datos inválidos del SUA', referencia_solicitud: ref, motivo } });
}

/** Estado de una solicitud, calculado a partir de sus dictámenes (RF-11, RF-12, RF-59). */
export async function calcularEstado(db: Tx, numeroSua: string, anio: number): Promise<string> {
  const sol = await db.solicitud.findUniqueOrThrow({ where: { numero_sua_anio: { numero_sua: numeroSua, anio } } });
  const dicts = await db.dictamen.findMany({ where: { numero_sua: numeroSua, anio }, orderBy: { fecha_firma: 'desc' } });
  // RF-59: dos dictámenes pendientes de elección → Pendiente-revisión
  if (dicts.filter((d) => d.vigente === null).length >= 2) return 'Pendiente-revisión';
  const vigente = dicts.find((d) => d.vigente === true);
  if (!vigente) return 'Pendiente';
  // RF-12: re-derivada después de su último dictamen → Pendiente-revisión
  return vigente.fecha_emision < sol.fecha_ultima_derivacion ? 'Pendiente-revisión' : 'Dictaminada';
}

export async function recalcularEstado(db: Tx, numeroSua: string, anio: number) {
  const estado = await calcularEstado(db, numeroSua, anio);
  await db.solicitud.update({ where: { numero_sua_anio: { numero_sua: numeroSua, anio } }, data: { estado } });
  return estado;
}

async function geocodificarSeguro(direccion: string) {
  try { return await providers.geocoder.geocodificar(direccion); } catch { return null; }
}

/**
 * Lee las solicitudes derivadas por el SUA y las incorpora al sistema (Decisión 9: geocodifica una sola vez,
 * al derivar). Detecta re-derivaciones (RF-12). Idempotente.
 */
export async function sincronizarDesdeSua(opciones: { crearHistorial?: boolean } = {}) {
  const crearHistorial = opciones.crearHistorial ?? true;
  const derivadas = await providers.reclamo.listarDerivadas();
  let nuevas = 0, redervadas = 0, rechazadas = 0;
  for (const bruto of derivadas) {
    const v = registroSuaSchema.safeParse(bruto);
    if (!v.success) {
      const i = v.error.issues[0];
      await registrarCasoInvalido(`${(bruto as any)?.numero_sua ?? '?'}-${(bruto as any)?.anio ?? '?'}`, `El campo ${i.path.join('.')} es inválido: ${i.message}.`);
      rechazadas++;
      continue;
    }
    const s = v.data as typeof bruto;
    const key = { numero_sua_anio: { numero_sua: s.numero_sua, anio: s.anio } };
    const existente = await prisma.solicitud.findUnique({ where: key });
    if (!existente) {
      const c = await geocodificarSeguro(s.direccion);
      await prisma.solicitud.create({
        data: {
          numero_sua: s.numero_sua, anio: s.anio, distrito: s.distrito, prioridad: s.prioridad, direccion: s.direccion,
          latitud: c?.lat ?? null, longitud: c?.lng ?? null, geo_ultimo_intento: c ? null : new Date(),
          descripcion_reclamo: s.descripcion_reclamo, es_tormenta: s.es_tormenta, fecha_ultima_derivacion: s.fecha_derivacion,
        },
      });
      if (crearHistorial) {
        await prisma.historialDerivacion.create({
          data: { numero_sua: s.numero_sua, anio: s.anio, fecha_derivacion: s.fecha_derivacion, motivo: 'Nueva' },
        });
      }
      nuevas++;
    } else if (s.es_rederivacion && s.fecha_derivacion > existente.fecha_ultima_derivacion) {
      await prisma.$transaction(async (tx) => {
        await tx.solicitud.update({ where: key, data: { fecha_ultima_derivacion: s.fecha_derivacion } });
        await tx.historialDerivacion.create({
          data: { numero_sua: s.numero_sua, anio: s.anio, fecha_derivacion: s.fecha_derivacion, motivo: 'Re-derivación por vencimiento' },
        });
        await recalcularEstado(tx, s.numero_sua, s.anio);
      });
      redervadas++;
    }
  }
  return { nuevas, redervadas, rechazadas };
}

/** RF-62: reintenta la geocodificación de las solicitudes sin coordenadas (se invoca cada hora). */
export async function reintentarGeocodificacion(): Promise<number> {
  const pendientes = await prisma.solicitud.findMany({ where: { latitud: null } });
  let ok = 0;
  for (const s of pendientes) {
    const c = await geocodificarSeguro(s.direccion);
    await prisma.solicitud.update({
      where: { numero_sua_anio: { numero_sua: s.numero_sua, anio: s.anio } },
      data: c ? { latitud: c.lat, longitud: c.lng, geo_ultimo_intento: null } : { geo_ultimo_intento: new Date() },
    });
    if (c) ok++;
  }
  return ok;
}
