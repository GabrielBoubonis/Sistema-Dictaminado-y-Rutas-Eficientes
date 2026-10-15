import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '../db';
import { ROLES } from '../catalogos';
import { AppError, ah, validar } from '../errors';
import { requireAuth, requireRol } from '../middleware/auth';
import { auditar } from '../services/audit';
import { contrasenaValida } from '../security';
import { BCRYPT_COST } from './auth';

export const usuariosRouter = Router();
usuariosRouter.use(requireAuth, requireRol('Administrador'));

const publico = (u: { nombre_usuario: string; nombre_completo: string; rol: string; activo: boolean; fecha_alta: Date }) =>
  ({ nombre_usuario: u.nombre_usuario, nombre_completo: u.nombre_completo, rol: u.rol, activo: u.activo, fecha_alta: u.fecha_alta });

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');

/** Formato definido en Alcance/Requisitos: inicial del nombre + hasta 6 letras del apellido + número incremental si se repite. */
async function generarNombreUsuario(nombre: string, apellido: string): Promise<string> {
  const base = (sinTildes(nombre).charAt(0) + sinTildes(apellido).slice(0, 6)) || 'usuario';
  // Siempre lleva número al final (ej. gboubon0); el primero libre desde 0.
  for (let n = 0; ; n++) {
    if (!(await prisma.usuario.findUnique({ where: { nombre_usuario: base + n } }))) return base + n;
  }
}

usuariosRouter.get('/', ah(async (_req, res) => {
  const us = await prisma.usuario.findMany({ orderBy: { nombre_usuario: 'asc' } });
  res.json(us.map(publico));
}));

usuariosRouter.post('/', ah(async (req, res) => {
  const b = validar(z.object({
    nombre: z.string().min(1).max(60), apellido: z.string().min(1).max(60),
    password: z.string(), rol: z.enum(ROLES),
  }), req.body);
  if (!contrasenaValida(b.password)) {
    throw new AppError(422, 'contrasena_debil', 'La contraseña debe tener al menos 8 caracteres, mayúscula, minúscula, número y carácter especial');
  }
  const nombre_usuario = await generarNombreUsuario(b.nombre, b.apellido);
  const hash = await bcrypt.hash(b.password, BCRYPT_COST());
  const u = await prisma.$transaction(async (tx) => {
    const nuevo = await tx.usuario.create({
      data: { nombre_usuario, nombre_completo: `${b.nombre.trim()} ${b.apellido.trim()}`, contrasena_hash: hash, rol: b.rol },
    });
    await auditar(tx, req.sesion!.usuario, 'Alta de usuario', nombre_usuario, null, b.rol);
    return nuevo;
  });
  res.status(201).json(publico(u));
}));

// ---- Captores (RF-52, RF-60): se declaran antes de las rutas con :id ----
usuariosRouter.get('/captores-bloqueados', ah(async (req, res) => {
  const codigo = typeof req.query.codigo === 'string' ? req.query.codigo.trim().toUpperCase() : '';
  const ds = await prisma.dispositivo.findMany({
    where: { estado: { in: ['Bloqueado', 'Revocado'] }, ...(codigo ? { codigo_visible: codigo } : {}) },
    orderBy: { fecha_bloqueo: 'desc' },
  });
  res.json(ds.map((d) => ({
    codigo: d.codigo_visible, usuario: d.nombre_usuario, estado: d.estado, fecha_bloqueo: d.fecha_bloqueo,
  })));
}));

usuariosRouter.post('/captores/:codigo/desbloquear', ah(async (req, res) => {
  const codigo = String(req.params.codigo).toUpperCase();
  const d = await prisma.dispositivo.findUnique({ where: { codigo_visible: codigo } });
  if (!d || d.estado === 'Activo') throw new AppError(404, 'captor_no_encontrado', 'No hay un captor bloqueado con ese código'); // CU-16 E1
  if (d.estado === 'Revocado') throw new AppError(409, 'captor_revocado', 'El captor fue revocado y no se puede desbloquear'); // CU-16 E2
  await prisma.$transaction(async (tx) => {
    await tx.dispositivo.update({
      where: { id_dispositivo: d.id_dispositivo },
      data: { estado: 'Activo', fecha_desbloqueo: new Date(), desbloqueado_por: req.sesion!.usuario },
    });
    await auditar(tx, req.sesion!.usuario, 'Desbloqueo de captor', `captor ${codigo}`, 'Bloqueado', 'Activo');
  });
  res.json({ ok: true, codigo });
}));

usuariosRouter.patch('/:id', ah(async (req, res) => {
  const id = String(req.params.id);
  const b = validar(z.object({ rol: z.enum(ROLES).optional(), activo: z.boolean().optional() }), req.body);
  const u = await prisma.usuario.findUnique({ where: { nombre_usuario: id } });
  if (!u) throw new AppError(404, 'usuario_no_encontrado');
  if (id === req.sesion!.usuario && (b.activo === false || (b.rol && b.rol !== u.rol))) {
    throw new AppError(409, 'accion_sobre_si_mismo', 'No podés cambiar tu propio rol ni darte de baja');
  }
  const r = await prisma.$transaction(async (tx) => {
    const data: { rol?: string; activo?: boolean } = {};
    if (b.rol && b.rol !== u.rol) {
      data.rol = b.rol;
      await auditar(tx, req.sesion!.usuario, 'Cambio de rol', id, u.rol, b.rol);
    }
    if (b.activo !== undefined && b.activo !== u.activo) {
      data.activo = b.activo;
      await auditar(tx, req.sesion!.usuario, b.activo ? 'Reactivación de usuario' : 'Baja de usuario', id, u.activo ? 'activo' : 'inactivo', b.activo ? 'activo' : 'inactivo');
      if (!b.activo) await tx.refreshToken.updateMany({ where: { nombre_usuario: id, revocado: false }, data: { revocado: true } });
    }
    return tx.usuario.update({ where: { nombre_usuario: id }, data });
  });
  res.json(publico(r));
}));

usuariosRouter.post('/:id/reset-password', ah(async (req, res) => {
  const id = String(req.params.id);
  const u = await prisma.usuario.findUnique({ where: { nombre_usuario: id } });
  if (!u) throw new AppError(404, 'usuario_no_encontrado');
  const b = validar(z.object({ password: z.string().optional() }), req.body ?? {});
  let nueva = b.password;
  if (nueva !== undefined && !contrasenaValida(nueva)) {
    throw new AppError(422, 'contrasena_debil', 'La contraseña debe tener al menos 8 caracteres, mayúscula, minúscula, número y carácter especial');
  }
  if (nueva === undefined) nueva = 'Aa1!' + crypto.randomBytes(6).toString('base64url');
  await prisma.usuario.update({ where: { nombre_usuario: id }, data: { contrasena_hash: await bcrypt.hash(nueva, BCRYPT_COST()) } });
  await prisma.refreshToken.updateMany({ where: { nombre_usuario: id, revocado: false }, data: { revocado: true } }); // la anterior queda sin efecto
  res.json({ ok: true, passwordNueva: b.password === undefined ? nueva : undefined });
}));

usuariosRouter.post('/:id/revocar-captor', ah(async (req, res) => {
  const id = String(req.params.id);
  const u = await prisma.usuario.findUnique({ where: { nombre_usuario: id } });
  if (!u) throw new AppError(404, 'usuario_no_encontrado');
  const b = validar(z.object({ codigo: z.string().optional() }), req.body ?? {});
  const ds = await prisma.dispositivo.findMany({
    where: { nombre_usuario: id, estado: { not: 'Revocado' }, ...(b.codigo ? { codigo_visible: b.codigo.toUpperCase() } : {}) },
  });
  if (ds.length === 0) throw new AppError(404, 'captor_no_encontrado', 'El usuario no tiene captores para revocar');
  await prisma.$transaction(async (tx) => {
    for (const d of ds) {
      await tx.dispositivo.update({ where: { id_dispositivo: d.id_dispositivo }, data: { estado: 'Revocado' } });
      await auditar(tx, req.sesion!.usuario, 'Revocación de captor', `captor ${d.codigo_visible} (${id})`, d.estado, 'Revocado');
    }
    await tx.refreshToken.updateMany({ where: { dispositivo_id: { in: ds.map((d) => d.id_dispositivo) }, revocado: false }, data: { revocado: true } });
  });
  res.json({ ok: true, revocados: ds.map((d) => d.codigo_visible) });
}));
