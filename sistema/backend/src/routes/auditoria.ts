import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { ah, validar } from '../errors';
import { requireAuth, requireRol } from '../middleware/auth';

export const auditoriaRouter = Router();
auditoriaRouter.use(requireAuth, requireRol('Administrador'));

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato AAAA-MM-DD');
const consulta = z.object({
  usuario: z.string().trim().min(1).optional(), accion: z.string().trim().min(1).optional(),
  desde: fecha.optional(), hasta: fecha.optional(),
  limite: z.coerce.number().int().min(1).max(500).default(200), pagina: z.coerce.number().int().min(1).default(1),
});

/** RF-55: consulta del log de auditoría por usuario, acción y rango de fechas. Solo lectura (RF-54). */
auditoriaRouter.get('/', ah(async (req, res) => {
  const f = validar(consulta, req.query);
  const where = {
    ...(f.usuario ? { nombre_usuario: f.usuario } : {}),
    ...(f.accion ? { accion: { contains: f.accion, mode: 'insensitive' as const } } : {}),
    ...(f.desde || f.hasta ? { fecha_hora: {
      ...(f.desde ? { gte: new Date(`${f.desde}T00:00:00-03:00`) } : {}),
      ...(f.hasta ? { lt: new Date(new Date(`${f.hasta}T00:00:00-03:00`).getTime() + 24 * 3600 * 1000) } : {}),
    } } : {}),
  };
  const [total, items] = await Promise.all([
    prisma.registroAuditoria.count({ where }),
    prisma.registroAuditoria.findMany({ where, orderBy: { id_auditoria: 'desc' }, take: f.limite, skip: (f.pagina - 1) * f.limite }),
  ]);
  res.json({ total, pagina: f.pagina, items });
}));
