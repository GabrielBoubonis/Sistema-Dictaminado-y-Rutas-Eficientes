import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { ah, validar } from '../errors';
import { requireAuth, requireRol } from '../middleware/auth';
import { normalizarNombre, tituloEspecie } from '../catalogos';

export const especiesRouter = Router();
especiesRouter.use(requireAuth);

/** RF-56: el selector filtra el catálogo mientras se escribe. */
especiesRouter.get('/', ah(async (req, res) => {
  const q = typeof req.query.q === 'string' ? normalizarNombre(req.query.q) : '';
  const lista = await prisma.especie.findMany({
    where: { activa: true, ...(q ? { nombre_normalizado: { contains: q } } : {}) }, orderBy: { nombre_comun: 'asc' }, take: 50,
  });
  res.json(lista.map(({ nombre_normalizado, ...e }) => e));
}));

const nueva = z.object({
  nombre_comun: z.string().trim().min(2).max(80).regex(/^[\p{L}\p{N} .'\-()]+$/u, 'Solo letras, números y signos simples'),
  nombre_cientifico: z.string().trim().max(120).regex(/^[\p{L} .'\-×]*$/u, 'Solo letras').optional(),
});

/** RF-56: agrega una especie nueva, normalizada y sin duplicados por mayúsculas o tildes; registra quién la agregó. */
especiesRouter.post('/', requireRol('Operador', 'Jefe'), ah(async (req, res) => {
  const b = validar(nueva, req.body);
  const norm = normalizarNombre(b.nombre_comun);
  const existente = await prisma.especie.findUnique({ where: { nombre_normalizado: norm } });
  if (existente) {
    const { nombre_normalizado, ...e } = existente;
    return res.status(200).json({ ...e, existente: true });
  }
  const creada = await prisma.especie.create({
    data: { nombre_comun: tituloEspecie(b.nombre_comun), nombre_cientifico: b.nombre_cientifico || null, nombre_normalizado: norm, creada_por: req.sesion!.usuario },
  });
  const { nombre_normalizado, ...e } = creada;
  res.status(201).json({ ...e, existente: false });
}));
