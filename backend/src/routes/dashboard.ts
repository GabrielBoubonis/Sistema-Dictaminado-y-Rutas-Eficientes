import { Router } from 'express';
import { z } from 'zod';
import { ah, validar } from '../errors';
import { requireAuth, requireRol } from '../middleware/auth';
import { calcularDashboard } from '../services/dashboard';

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth, requireRol('Jefe', 'Administrador', 'Lector'));

const consulta = z.object({
  anio: z.coerce.number().int().min(2000).max(2100).default(() => new Date().getFullYear()),
  mes: z.coerce.number().int().min(1).max(12).optional(),
});

dashboardRouter.get('/', ah(async (req, res) => {
  const f = validar(consulta, req.query);
  res.json(await calcularDashboard(f.anio, f.mes));
}));
