import {
  generateRegistrationOptions, verifyRegistrationResponse, verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/types';
import { prisma } from '../db';
import { config } from '../config';
import { AppError } from '../errors';

/**
 * Segundo factor (RF-51). Registro: el servidor emite un desafío y guarda la clave pública del dispositivo.
 * Firma: el desafío del WebAuthn ES el hash SHA-256 del contenido del dictamen (hash_firma), así el acto
 * biométrico queda atado a ese contenido exacto, sirve igual con o sin conexión (CU-10) y no admite repetición
 * (el uuid del dictamen es único). Por eso no se exige el contador de la credencial.
 */
const desafiosRegistro = new Map<string, { desafio: string; vence: number }>();

const b64u = (b: Uint8Array | Buffer) => Buffer.from(b).toString('base64url');

export async function opcionesRegistro(usuario: string) {
  const creds = await prisma.webauthnCredential.findMany({ where: { nombre_usuario: usuario } });
  const opts = await generateRegistrationOptions({
    rpName: 'Dictaminado y Rutas Eficientes', rpID: config.rpId, userID: new TextEncoder().encode(usuario), userName: usuario,
    attestationType: 'none',
    excludeCredentials: creds.map((c) => ({ id: c.id, transports: (c.transports?.split(',') ?? []) as any })),
    authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
  });
  desafiosRegistro.set(usuario, { desafio: opts.challenge, vence: Date.now() + 5 * 60 * 1000 });
  return opts;
}

export async function verificarRegistro(usuario: string, respuesta: RegistrationResponseJSON) {
  const d = desafiosRegistro.get(usuario);
  if (!d || d.vence < Date.now()) throw new AppError(400, 'desafio_vencido', 'Volvé a iniciar el registro de la huella');
  let v;
  try {
    v = await verifyRegistrationResponse({
      response: respuesta, expectedChallenge: d.desafio, expectedOrigin: config.origin, expectedRPID: config.rpId, requireUserVerification: true,
    });
  } catch (e: any) { throw new AppError(400, 'registro_invalido', `No se pudo registrar el dispositivo: ${e.message}`); }
  if (!v.verified || !v.registrationInfo) throw new AppError(400, 'registro_invalido', 'No se pudo registrar el dispositivo');
  desafiosRegistro.delete(usuario);
  const { credentialID, credentialPublicKey } = v.registrationInfo;
  await prisma.webauthnCredential.upsert({
    where: { id: credentialID },
    create: { id: credentialID, nombre_usuario: usuario, public_key: b64u(credentialPublicKey), counter: 0, transports: respuesta.response.transports?.join(',') ?? null },
    update: { public_key: b64u(credentialPublicKey) },
  });
}

export const desafioDeFirma = (hashFirmaHex: string) => b64u(Buffer.from(hashFirmaHex, 'hex'));

export type ResultadoSegundoFactor = { ok: true } | { ok: false; codigo: string; mensaje: string };

/** Verifica la aserción WebAuthn de la firma de un dictamen. En desarrollo permite simularla (WEBAUTHN_SIMULADO=1). */
export async function verificarFirma(usuario: string, hashFirmaHex: string, respuesta: AuthenticationResponseJSON | { simulado: true } | undefined): Promise<ResultadoSegundoFactor> {
  if (respuesta && 'simulado' in respuesta) {
    if (!config.isProd && process.env.WEBAUTHN_SIMULADO === '1') return { ok: true };
    return { ok: false, codigo: 'segundo_factor_invalido', mensaje: 'La verificación simulada no está habilitada' };
  }
  if (!respuesta) return { ok: false, codigo: 'segundo_factor_requerido', mensaje: 'Falta la verificación biométrica (RF-51)' };
  const cred = await prisma.webauthnCredential.findUnique({ where: { id: respuesta.id } });
  if (!cred || cred.nombre_usuario !== usuario) {
    return { ok: false, codigo: 'segundo_factor_invalido', mensaje: 'La credencial no pertenece a este usuario' };
  }
  try {
    const v = await verifyAuthenticationResponse({
      response: respuesta, expectedChallenge: desafioDeFirma(hashFirmaHex), expectedOrigin: config.origin, expectedRPID: config.rpId,
      authenticator: { credentialID: cred.id, credentialPublicKey: Buffer.from(cred.public_key, 'base64url'), counter: 0 },
      requireUserVerification: true,
    });
    return v.verified ? { ok: true } : { ok: false, codigo: 'segundo_factor_invalido', mensaje: 'La verificación biométrica no es válida' };
  } catch (e: any) {
    return { ok: false, codigo: 'segundo_factor_invalido', mensaje: `La verificación biométrica falló: ${e.message}` };
  }
}

export async function tieneCredencial(usuario: string) {
  return (await prisma.webauthnCredential.count({ where: { nombre_usuario: usuario } })) > 0;
}
