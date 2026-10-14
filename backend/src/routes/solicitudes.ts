import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { AppError, ah, validar } from '../errors';
import { requireAuth, requireRol } from '../middleware/auth';
import { catalogos, ESTADOS_SOLICITUD } from '../catalogos';

export const solicitudesRouter = Router();
solicitudesRouter.use(requireAuth, requireRol('Operador', 'Jefe'));

const consulta = z.object({
  estado: z.enum(ESTADOS_SOLICITUD).optional(),
  distrito: z.enum(catalogos.distritos as [string, ...string[]]).optional(),
  prioridad: z.enum(catalogos.nivel_prioridad as [string, ...string[]]).optional(),
  q: z.string().trim().min(1).optional(),
});

/** RF-13: listado de pendientes y pendientes-revisión sin restricción de asignación. RF-39: sin las de tormenta. */
solicitudesRouter.get('/', ah(async (req, res) => {
  const f = validar(consulta, req.query);
  const sols = await prisma.solicitud.findMany({
    where: {
      es_tormenta: false,
      estado: f.estado ?? { in: ['Pendiente', 'Pendiente-revisión'] },
      ...(f.distrito ? { distrito: f.distrito } : {}),
      ...(f.prioridad ? { prioridad: f.prioridad } : {}),
      ...(f.q ? { OR: [{ direccion: { contains: f.q, mode: 'insensitive' } }, { numero_sua: { contains: f.q } }] } : {}),
    },
    include: {
      enRutas: { where: { liberada: false }, include: { ruta: { select: { nombre_usuario: true } } } },
      dictamenes: { where: { vigente: null }, select: { id_dictamen: true } },
    },
    orderBy: [{ fecha_ultima_derivacion: 'asc' }, { numero_sua: 'asc' }],
  });
  res.json(sols.map(({ enRutas, dictamenes, ...s }) => ({
    ...s,
    en_conflicto: dictamenes.length > 0, // dos dictámenes firmados esperando la elección de un Jefe (RF-59)
    sin_ubicar: s.latitud === null,
    reservada_por: enRutas[0]?.ruta.nombre_usuario ?? null,
  })));
}));

solicitudesRouter.get('/:numeroSua/:anio', ah(async (req, res) => {
  const anio = Number(req.params.anio);
  if (!Number.isInteger(anio)) throw new AppError(422, 'datos_invalidos', 'Año inválido');
  const s = await prisma.solicitud.findUnique({
    where: { numero_sua_anio: { numero_sua: String(req.params.numeroSua), anio } },
    include: {
      historial: { orderBy: { fecha_derivacion: 'asc' } },
      dictamenes: { select: { id_dictamen: true, uuid_dictamen: true, fecha_emision: true, nombre_usuario: true, vigente: true }, orderBy: { fecha_emision: 'desc' } },
      enRutas: { where: { liberada: false }, include: { ruta: { select: { nombre_usuario: true } } } },
    },
  });
  if (!s) throw new AppError(404, 'solicitud_no_encontrada');
  const { enRutas, ...resto } = s;
  res.json({ ...resto, sin_ubicar: s.latitud === null, reservada_por: enRutas[0]?.ruta.nombre_usuario ?? null });
}));
