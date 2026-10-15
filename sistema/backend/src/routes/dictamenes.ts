import fs from 'fs';
import path from 'path';
import { Router } from 'express';
import { prisma } from '../db';
import { config } from '../config';
import { AppError, ah } from '../errors';
import { requireAuth, requireRol } from '../middleware/auth';
import { elegirVigente, registrarDictamen } from '../services/registro-dictamen';
import { generarPdf } from '../services/pdf';

export const dictamenesRouter = Router();
dictamenesRouter.use(requireAuth);

const entero = (v: unknown, nombre: string) => {
  const n = Number(v);
  if (!Number.isInteger(n)) throw new AppError(422, 'datos_invalidos', `${nombre} inválido`);
  return n;
};
const incluir = { aereos: true, subterraneos: true, fotos: { orderBy: { orden: 'asc' as const } }, especie: true };
const publico = (d: any) => {
  const { sua_intentos, sua_proximo_intento, fotos, aereos, subterraneos, ...r } = d;
  return {
    ...r,
    trabajos_aereos: aereos?.map((t: any) => t.tipo_trabajo) ?? [],
    trabajos_subterraneos: subterraneos?.map((t: any) => ({ tipo_trabajo: t.tipo_trabajo, distancia_borde: t.distancia_borde })) ?? [],
    fotos: fotos?.map((f: any) => ({ orden: f.orden, url: `/api/dictamenes/${d.id_dictamen}/fotos/${f.orden}` })) ?? [],
  };
};

/** RF-20, RF-21, RF-22, RF-45, RF-46, RF-51, RF-61. Cuerpo: dictamen + `segundo_factor` (aserción WebAuthn). */
dictamenesRouter.post('/', requireRol('Operador', 'Jefe'), ah(async (req, res) => {
  const { segundo_factor, ...dictamen } = req.body ?? {};
  const r = await registrarDictamen(req.sesion!.usuario, dictamen, segundo_factor, 'online');
  res.status(r.duplicado ? 200 : 201).json(r);
}));

/** RF-27 / RF-28: historial completo del caso, sin sobrescribir. */
dictamenesRouter.get('/:numeroSua/:anio/historial', ah(async (req, res) => {
  const anio = entero(req.params.anio, 'Año');
  const ds = await prisma.dictamen.findMany({
    where: { numero_sua: String(req.params.numeroSua), anio }, include: incluir, orderBy: { fecha_firma: 'desc' },
  });
  res.json(ds.map(publico));
}));

/** RF-59: solo un Jefe ve ambos dictámenes y elige cuál queda vigente. */
dictamenesRouter.get('/:numeroSua/:anio/conflicto', requireRol('Jefe'), ah(async (req, res) => {
  const anio = entero(req.params.anio, 'Año');
  const ds = await prisma.dictamen.findMany({
    where: { numero_sua: String(req.params.numeroSua), anio, vigente: null }, include: incluir, orderBy: { fecha_firma: 'asc' },
  });
  res.json({ hay_conflicto: ds.length >= 2, dictamenes: ds.map(publico) });
}));

dictamenesRouter.post('/:id/vigente', requireRol('Jefe'), ah(async (req, res) => {
  res.json({ ok: true, ...(await elegirVigente(entero(req.params.id, 'Id'), req.sesion!.usuario)) });
}));

dictamenesRouter.get('/:id/pdf', ah(async (req, res) => {
  const id = entero(req.params.id, 'Id');
  const doc = await generarPdf(id);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="dictamen-${id}.pdf"`);
  doc.pipe(res);
}));

dictamenesRouter.get('/:id/fotos/:orden', ah(async (req, res) => {
  const f = await prisma.fotografia.findFirst({ where: { id_dictamen: entero(req.params.id, 'Id'), orden: entero(req.params.orden, 'Orden') } });
  if (!f) throw new AppError(404, 'foto_no_encontrada');
  const ruta = path.resolve(config.uploadsDir, f.archivo_referencia);
  if (!ruta.startsWith(path.resolve(config.uploadsDir) + path.sep) || !fs.existsSync(ruta)) throw new AppError(404, 'foto_no_encontrada');
  res.type(path.extname(ruta)).sendFile(ruta);
}));

dictamenesRouter.get('/:id', ah(async (req, res) => {
  const d = await prisma.dictamen.findUnique({ where: { id_dictamen: entero(req.params.id, 'Id') }, include: incluir });
  if (!d) throw new AppError(404, 'dictamen_no_encontrado');
  res.json(publico(d));
}));
