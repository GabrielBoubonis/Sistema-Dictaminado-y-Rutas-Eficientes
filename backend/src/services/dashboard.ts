import { prisma } from '../db';

export interface Metricas { derivadas: number; dictaminadas: number; sin_dictaminar: number }
const vacio = (): Metricas => ({ derivadas: 0, dictaminadas: 0, sin_dictaminar: 0 });

/**
 * RF-35 a RF-37, RF-44. Cada evento de derivación (la original y cada re-derivación por vencimiento) cuenta por separado.
 * Un evento está "dictaminado" si entre esa derivación y la siguiente (o hoy) existe un dictamen firmado válido.
 */
export async function calcularDashboard(anio: number, mes?: number) {
  const desde = new Date(Date.UTC(anio, mes ? mes - 1 : 0, 1));
  const hasta = new Date(Date.UTC(mes ? anio : anio + 1, mes ? mes : 0, 1));
  const eventos = await prisma.historialDerivacion.findMany({
    where: { fecha_derivacion: { gte: desde, lt: hasta } }, include: { solicitud: true },
  });
  const claves = [...new Set(eventos.map((e) => `${e.numero_sua}|${e.anio}`))];
  const solicitudes = claves.map((c) => { const [n, a] = c.split('|'); return { numero_sua: n, anio: Number(a) }; });
  const todosEventos = solicitudes.length
    ? await prisma.historialDerivacion.findMany({ where: { OR: solicitudes }, orderBy: { fecha_derivacion: 'asc' } }) : [];
  const dictamenes = solicitudes.length
    ? await prisma.dictamen.findMany({
        where: { OR: solicitudes, estado_sincronizacion: { not: 'integridad_no_verificada' } }, select: { numero_sua: true, anio: true, fecha_emision: true },
      }) : [];

  const general = vacio(), tormenta = vacio();
  const porDistrito: Record<string, Metricas> = {};
  for (const e of eventos) {
    const siguiente = todosEventos.find((x) => x.numero_sua === e.numero_sua && x.anio === e.anio && x.fecha_derivacion > e.fecha_derivacion && x.id_derivacion !== e.id_derivacion);
    const dictaminado = dictamenes.some((d) => d.numero_sua === e.numero_sua && d.anio === e.anio
      && d.fecha_emision >= e.fecha_derivacion && (!siguiente || d.fecha_emision < siguiente.fecha_derivacion));
    const destinos = [general, (porDistrito[e.solicitud.distrito] ??= vacio())];
    if (e.solicitud.es_tormenta) destinos.push(tormenta);
    for (const m of destinos) { m.derivadas++; if (dictaminado) m.dictaminadas++; else m.sin_dictaminar++; }
  }
  return { periodo: { anio, mes: mes ?? null }, general, tormenta, por_distrito: porDistrito };
}
