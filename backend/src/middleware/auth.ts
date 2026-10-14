import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { prisma } from '../db';
import { AppError } from '../errors';
import type { Rol } from '../catalogos';

export interface Sesion { usuario: string; rol: Rol; did?: string }
declare global { namespace Express { interface Request { sesion?: Sesion } } }

export function firmarAccess(usuario: string, rol: string, did?: string): string {
  return jwt.sign({ rol, did }, config.jwtSecret, { subject: usuario, expiresIn: config.accessTtlSeconds });
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const h = req.headers.authorization;
    if (!h?.startsWith('Bearer ')) throw new AppError(401, 'no_autenticado', 'Falta el token');
    let payload: any;
    try { payload = jwt.verify(h.slice(7), config.jwtSecret); }
    catch { throw new AppError(401, 'token_invalido', 'Sesión vencida o token inválido'); }
    const u = await prisma.usuario.findUnique({ where: { nombre_usuario: payload.sub } });
    if (!u || !u.activo) throw new AppError(401, 'usuario_inactivo', 'El usuario fue dado de baja');
    if (payload.did) {
      const d = await prisma.dispositivo.findUnique({ where: { id_dispositivo: payload.did } });
      if (d?.estado === 'Revocado') {
        throw new AppError(401, 'sesion_finalizada', 'Sesión finalizada por un administrador');
      }
    }
    req.sesion = { usuario: u.nombre_usuario, rol: u.rol as Rol, did: payload.did };
    next();
  } catch (e) { next(e); }
}

export const requireRol = (...roles: Rol[]) => (req: Request, _res: Response, next: NextFunction) => {
  if (!req.sesion || !roles.includes(req.sesion.rol)) {
    return next(new AppError(403, 'sin_permiso', 'No tenés permiso para esta acción'));
  }
  next();
};
