import { Router } from 'express';
import { prisma } from '../db';
import { ah } from '../errors';
import { requireAuth, requireRol } from '../middleware/auth';

export const revisionRouter = Router();
revisionRouter.use(requireAuth, requireRol('Administrador'));

/** RF-58: apartado "Para revisar", solo lectura (integridad no verificada y datos inválidos del SUA). */
revisionRouter.get('/', ah(async (_req, res) => {
  res.json(await prisma.casoRevision.findMany({ orderBy: { fecha_hora: 'desc' } }));
}));
