import { Router } from 'express';
import { z } from 'zod';
import { AppError, ah, validar } from '../errors';
import { requireAuth, requireRol } from '../middleware/auth';
import { catalogos, MODOS } from '../catalogos';
import { cerrarRutasVencidas, detalleRuta, generarRuta, restablecerRuta, rutaActivaDe } from '../services/rutas';

export const rutasRouter = Router();
rutasRouter.use(requireAuth, requireRol('Operador', 'Jefe'));

const cant = z.number().int().min(0).max(100).optional();
const generar = z.object({
  modo: z.enum(MODOS),
  distrito: z.enum(catalogos.distritos as [string, ...string[]]).optional(), // RF-15: filtro opcional
  zona: z.array(z.tuple([z.number().min(-90).max(90), z.number().min(-180).max(180)])).min(3).optional(),
  cantidades: z.object({ Alta: cant, Media: cant, Baja: cant }),
  ubicacion: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).optional(), // RF-48: partida desde la ubicación actual
}).refine((b) => Object.values(b.cantidades).some((n) => (n ?? 0) > 0), { message: 'Indicá al menos una cantidad', path: ['cantidades'] });

/** RF-14 a RF-19, RF-47 a RF-49. RF-19: requiere conexión (el servidor es la única fuente de reservas). */
rutasRouter.post('/', ah(async (req, res) => {
  const b = validar(generar, req.body);
  const ruta = await generarRuta({ usuario: req.sesion!.usuario, tipo: 'Normal', modo: b.modo, distrito: b.distrito, zona: b.zona, cantidades: b.cantidades, ubicacion: b.ubicacion });
  res.status(201).json(await detalleRuta(ruta.id_ruta));
}));

rutasRouter.get('/activa', ah(async (req, res) => {
  await cerrarRutasVencidas();
  const r = await rutaActivaDe(req.sesion!.usuario);
  res.json(r ? await detalleRuta(r.id_ruta) : null);
}));

rutasRouter.post('/:id/restablecer', ah(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new AppError(422, 'datos_invalidos');
  res.json({ ok: true, ...(await restablecerRuta(id, req.sesion!.usuario)) });
}));
