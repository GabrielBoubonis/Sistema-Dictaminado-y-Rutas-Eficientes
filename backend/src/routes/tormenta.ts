import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { ah, validar } from '../errors';
import { requireAuth, requireRol } from '../middleware/auth';
import { MODOS } from '../catalogos';
import { detalleRuta, generarRuta } from '../services/rutas';

export const tormentaRouter = Router();
tormentaRouter.use(requireAuth);

/** RF-38 a RF-40: solo las solicitudes con etiqueta de emergencia por tormenta. */
tormentaRouter.get('/', requireRol('Operador', 'Jefe', 'Administrador', 'Lector'), ah(async (_req, res) => {
  const sols = await prisma.solicitud.findMany({
    where: { es_tormenta: true, estado: { in: ['Pendiente', 'Pendiente-revisión'] } },
    include: { enRutas: { where: { liberada: false }, include: { ruta: { select: { nombre_usuario: true } } } } },
    orderBy: [{ fecha_ultima_derivacion: 'asc' }, { numero_sua: 'asc' }],
  });
  res.json({
    hay_pendientes: sols.length > 0, // dispara el indicador animado (RF-40)
    solicitudes: sols.map(({ enRutas, ...s }) => ({ ...s, sin_ubicar: s.latitud === null, reservada_por: enRutas[0]?.ruta.nombre_usuario ?? null })),
  });
}));

const generar = z.object({ modo: z.enum(MODOS), total: z.number().int().min(1).max(100) });

/** RF-41 / RF-42: solo la cantidad; siempre las más antiguas primero; mismas reglas de exclusión y liberación. */
tormentaRouter.post('/rutas', requireRol('Operador', 'Jefe'), ah(async (req, res) => {
  const b = validar(generar, req.body);
  const ruta = await generarRuta({ usuario: req.sesion!.usuario, tipo: 'Tormenta', modo: b.modo, total: b.total });
  res.status(201).json(await detalleRuta(ruta.id_ruta));
}));
