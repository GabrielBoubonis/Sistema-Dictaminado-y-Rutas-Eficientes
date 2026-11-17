import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { ah, validar } from '../errors';
import { requireAuth, requireRol } from '../middleware/auth';
import { catalogos } from '../catalogos';

/** RF-64: solicitudes dictaminadas con su dictamen vigente, para consultar y descargar el PDF. También para el Lector. */
export const dictaminadosRouter = Router();
dictaminadosRouter.use(requireAuth, requireRol('Operador', 'Jefe', 'Lector', 'Administrador'));

const consulta = z.object({
  distrito: z.enum(catalogos.distritos as [string, ...string[]]).optional(),
  q: z.string().trim().min(1).max(100).optional(),
});

dictaminadosRouter.get('/', ah(async (req, res) => {
  const f = validar(consulta, req.query);
  const sols = await prisma.solicitud.findMany({
    where: {
      estado: 'Dictaminada',
      ...(f.distrito ? { distrito: f.distrito } : {}),
      ...(f.q ? { OR: [{ direccion: { contains: f.q, mode: 'insensitive' } }, { numero_sua: { contains: f.q } }] } : {}),
    },
    include: {
      dictamenes: {
        where: { vigente: true }, orderBy: { fecha_firma: 'desc' }, take: 1,
        select: {
          id_dictamen: true, nombre_usuario: true, fecha_emision: true, fecha_firma: true, es_extraccion: true, es_sin_trabajo: true,
          motivo_extraccion: true, motivo_sin_trabajo: true, especie: { select: { nombre_comun: true } },
        },
      },
    },
  });
  const filas = sols.filter((s) => s.dictamenes.length).map(({ dictamenes: [d], ...s }) => ({
    numero_sua: s.numero_sua, anio: s.anio, direccion: s.direccion, distrito: s.distrito, prioridad: s.prioridad, es_tormenta: s.es_tormenta,
    dictamen: {
      id_dictamen: d.id_dictamen, autor: d.nombre_usuario, fecha_emision: d.fecha_emision, fecha_firma: d.fecha_firma, especie: d.especie.nombre_comun,
      resultado: d.es_extraccion ? `Extracción · ${d.motivo_extraccion}` : d.es_sin_trabajo ? `Sin trabajo · ${d.motivo_sin_trabajo}` : 'Trabajos de mantenimiento',
    },
  }));
  filas.sort((a, b) => b.dictamen.fecha_firma.getTime() - a.dictamen.fecha_firma.getTime());
  res.json(filas);
}));
