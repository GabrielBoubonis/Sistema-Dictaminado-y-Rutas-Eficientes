import crypto from 'crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../db';
import { config } from '../config';
import { AppError, ah, validar } from '../errors';
import { firmarAccess, requireAuth } from '../middleware/auth';
import { throttle } from '../middleware/throttle';
import { ProveedorNoDisponible, providers } from '../providers';
import { codigoDispositivo, sha256 } from '../security';
import { opcionesRegistro, tieneCredencial, verificarRegistro } from '../services/webauthn';

export const BCRYPT_COST = () => Number(process.env.BCRYPT_COST ?? 12); // RNF-05
let dummyHash: string | null = null;
const hashFicticio = () => (dummyHash ??= bcrypt.hashSync('no-existe', BCRYPT_COST()));

const MSG_GENERICO = 'Usuario o contraseña incorrectos'; // RF-50: idéntico para cualquier fallo de credenciales

/** Obtiene o crea el registro del captor y su código visible. */
export async function asegurarDispositivo(id: string, usuario?: string) {
  let d = await prisma.dispositivo.findUnique({ where: { id_dispositivo: id } });
  if (!d) {
    for (let i = 0; ; i++) {
      const codigo = codigoDispositivo(id, i ? String(i) : '');
      if (!(await prisma.dispositivo.findUnique({ where: { codigo_visible: codigo } }))) {
        d = await prisma.dispositivo.create({ data: { id_dispositivo: id, codigo_visible: codigo, nombre_usuario: usuario ?? null } });
        break;
      }
    }
  }
  return d!;
}

async function emitirTokens(usuario: string, rol: string, did: string | undefined, cadenaInicio: Date) {
  const id = crypto.randomUUID();
  const secreto = crypto.randomBytes(32).toString('base64url');
  const ahora = Date.now();
  const tope = cadenaInicio.getTime() + config.refreshCapMs; // RNF-20: tope absoluto de 7 días
  // la ventana de inactividad de la sesión es la misma que la del access token (RF-04: 30 min)
  const expira = new Date(Math.min(ahora + config.accessTtlSeconds * 1000, tope));
  await prisma.refreshToken.create({
    data: { id, nombre_usuario: usuario, token_hash: sha256(secreto), cadena_inicio: cadenaInicio, expira, dispositivo_id: did ?? null },
  });
  return {
    accessToken: firmarAccess(usuario, rol, did),
    refreshToken: `${id}.${secreto}`,
    expiraEnSegundos: config.accessTtlSeconds,
  };
}

export const authRouter = Router();

authRouter.post('/login', ah(async (req, res) => {
  const b = validar(z.object({
    usuario: z.string().min(1).max(60), password: z.string().min(1).max(200), dispositivoId: z.string().uuid().optional(),
  }), req.body);
  const ip = req.ip ?? 'ip';

  const espera = throttle.restante(ip, b.usuario);
  if (espera > 0) {
    res.setHeader('Retry-After', String(espera));
    throw new AppError(429, 'demasiados_intentos', 'Demasiados intentos. Probá de nuevo más tarde.', { reintentarEnSegundos: espera });
  }

  if (b.dispositivoId) {
    const d = await prisma.dispositivo.findUnique({ where: { id_dispositivo: b.dispositivoId } });
    if (d?.estado === 'Revocado') throw new AppError(403, 'sesion_finalizada', 'Sesión finalizada por un administrador');
    if (d?.estado === 'Bloqueado') throw new AppError(423, 'captor_bloqueado', 'Captor bloqueado', { codigo: d.codigo_visible });
  }

  // Paso 1: credenciales locales (bcrypt también contra un hash ficticio si el usuario no existe: mismo tiempo de respuesta)
  const u = await prisma.usuario.findUnique({ where: { nombre_usuario: b.usuario } });
  const okPass = await bcrypt.compare(b.password, u?.contrasena_hash ?? hashFicticio());
  const fallar = () => {
    throttle.registrarFallo(ip, b.usuario);
    throw new AppError(401, 'credenciales_invalidas', MSG_GENERICO);
  };
  if (!u || !u.activo || !okPass) return fallar();

  // Paso 2: vigencia en la Autenticación Institucional (RF-02)
  let vigente: boolean;
  try { vigente = await providers.auth.estaVigente(u.nombre_usuario); }
  catch (e) {
    if (e instanceof ProveedorNoDisponible) {
      // CU-01 E1: mensaje distinto del genérico y NO cuenta como intento fallido (RF-50, RF-52, RNF-19)
      throw new AppError(503, 'autenticacion_no_disponible', 'El servicio de autenticación no está disponible. Intentá nuevamente en un rato.');
    }
    throw e;
  }
  if (!vigente) return fallar();

  throttle.registrarExito(ip, b.usuario);
  let dispositivo: { codigo: string } | undefined;
  if (b.dispositivoId) {
    const d = await asegurarDispositivo(b.dispositivoId, u.nombre_usuario);
    await prisma.dispositivo.update({ where: { id_dispositivo: d.id_dispositivo }, data: { nombre_usuario: u.nombre_usuario } });
    dispositivo = { codigo: d.codigo_visible };
  }
  const tokens = await emitirTokens(u.nombre_usuario, u.rol, b.dispositivoId, new Date());
  res.json({ ...tokens, usuario: { nombre_usuario: u.nombre_usuario, nombre_completo: u.nombre_completo, rol: u.rol }, dispositivo });
}));

authRouter.post('/refresh', ah(async (req, res) => {
  const { refreshToken } = validar(z.object({ refreshToken: z.string().min(10) }), req.body);
  const [id, secreto] = refreshToken.split('.');
  const rt = id && secreto ? await prisma.refreshToken.findUnique({ where: { id } }) : null;
  const okHash = rt && crypto.timingSafeEqual(Buffer.from(rt.token_hash), Buffer.from(sha256(secreto)));
  if (!rt || !okHash || rt.revocado) throw new AppError(401, 'sesion_invalida', 'Sesión inválida');
  const ahora = Date.now();
  if (rt.cadena_inicio.getTime() + config.refreshCapMs <= ahora) {
    throw new AppError(401, 'sesion_vencida', 'La sesión superó el máximo de 7 días: ingresá de nuevo'); // RNF-20
  }
  if (rt.expira.getTime() <= ahora) throw new AppError(401, 'sesion_vencida', 'La sesión venció por inactividad'); // RF-04
  const u = await prisma.usuario.findUnique({ where: { nombre_usuario: rt.nombre_usuario } });
  if (!u || !u.activo) throw new AppError(401, 'usuario_inactivo', 'El usuario fue dado de baja');
  if (rt.dispositivo_id) {
    const d = await prisma.dispositivo.findUnique({ where: { id_dispositivo: rt.dispositivo_id } });
    if (d?.estado === 'Revocado') throw new AppError(401, 'sesion_finalizada', 'Sesión finalizada por un administrador');
  }
  await prisma.refreshToken.update({ where: { id }, data: { revocado: true } });
  const tokens = await emitirTokens(u.nombre_usuario, u.rol, rt.dispositivo_id ?? undefined, rt.cadena_inicio);
  res.json(tokens);
}));

authRouter.post('/logout', requireAuth, ah(async (req, res) => {
  await prisma.refreshToken.updateMany({
    where: { nombre_usuario: req.sesion!.usuario, dispositivo_id: req.sesion!.did ?? null, revocado: false },
    data: { revocado: true },
  });
  res.json({ ok: true });
}));

authRouter.get('/me', requireAuth, ah(async (req, res) => {
  const u = await prisma.usuario.findUniqueOrThrow({ where: { nombre_usuario: req.sesion!.usuario } });
  res.json({ nombre_usuario: u.nombre_usuario, nombre_completo: u.nombre_completo, rol: u.rol });
}));

/** RF-57: al volver la conexión tras reanudar una sesión sin señal, se revalida la vigencia del usuario. */
authRouter.post('/revalidar', requireAuth, ah(async (req, res) => {
  let vigente: boolean;
  try { vigente = await providers.auth.estaVigente(req.sesion!.usuario); }
  catch (e) {
    if (e instanceof ProveedorNoDisponible) throw new AppError(503, 'autenticacion_no_disponible', 'Autenticación Institucional no disponible');
    throw e;
  }
  if (!vigente) {
    await prisma.refreshToken.updateMany({ where: { nombre_usuario: req.sesion!.usuario, revocado: false }, data: { revocado: true } });
    throw new AppError(401, 'usuario_no_vigente', 'El usuario ya no está vigente en la institución');
  }
  res.json({ vigente: true });
}));

// ---- Estado de un captor (RF-52, RF-60) ----
authRouter.post('/dispositivo/bloqueo', ah(async (req, res) => {
  const b = validar(z.object({ dispositivoId: z.string().uuid(), usuario: z.string().max(60).optional() }), req.body);
  const d = await asegurarDispositivo(b.dispositivoId, b.usuario);
  if (d.estado === 'Activo') {
    await prisma.dispositivo.update({ where: { id_dispositivo: d.id_dispositivo }, data: { estado: 'Bloqueado', fecha_bloqueo: new Date(), fecha_desbloqueo: null } });
  }
  const actual = await prisma.dispositivo.findUniqueOrThrow({ where: { id_dispositivo: d.id_dispositivo } });
  res.json({ estado: actual.estado, codigo: actual.codigo_visible });
}));

authRouter.get('/dispositivo/:id', ah(async (req, res) => {
  const d = await prisma.dispositivo.findUnique({ where: { id_dispositivo: String(req.params.id) } });
  if (!d) return res.json({ estado: 'Desconocido' });
  res.json({ estado: d.estado, codigo: d.codigo_visible });
}));

// ---------- Segundo factor WebAuthn (RF-51) ----------
authRouter.get('/webauthn/estado', requireAuth, ah(async (req, res) => {
  res.json({ registrado: await tieneCredencial(req.sesion!.usuario) });
}));
authRouter.get('/webauthn/credenciales', requireAuth, ah(async (req, res) => {
  const cs = await prisma.webauthnCredential.findMany({ where: { nombre_usuario: req.sesion!.usuario }, select: { id: true } });
  res.json(cs.map((c) => c.id));
}));
authRouter.post('/webauthn/registro/opciones', requireAuth, ah(async (req, res) => {
  res.json(await opcionesRegistro(req.sesion!.usuario));
}));
authRouter.post('/webauthn/registro/verificar', requireAuth, ah(async (req, res) => {
  await verificarRegistro(req.sesion!.usuario, req.body);
  res.json({ ok: true });
}));
