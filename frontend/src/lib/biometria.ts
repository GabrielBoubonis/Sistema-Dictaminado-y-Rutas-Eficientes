import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { api } from './api';
import { bytesABase64Url, hexABytes } from './canonical';

/** RF-51: segundo factor biométrico. El desafío WebAuthn es el hash SHA-256 del dictamen, así queda atado a ese contenido. */
const claveLocal = (usuario: string) => `webauthn:${usuario}`;
const idsLocales = (usuario: string): string[] => { try { return JSON.parse(localStorage.getItem(claveLocal(usuario)) ?? '[]'); } catch { return []; } };

export async function credencialesDe(usuario: string): Promise<string[]> {
  try {
    const ids: string[] = await api('/auth/webauthn/credenciales');
    localStorage.setItem(claveLocal(usuario), JSON.stringify(ids));
    return ids;
  } catch { return idsLocales(usuario); } // sin señal: las conocidas en este captor
}

export async function registrarHuella(usuario: string): Promise<void> {
  const opciones = await api('/auth/webauthn/registro/opciones', { body: {} });
  const respuesta = await startRegistration(opciones);
  await api('/auth/webauthn/registro/verificar', { body: respuesta });
  localStorage.setItem(claveLocal(usuario), JSON.stringify([...new Set([...idsLocales(usuario), respuesta.id])]));
}

export async function firmarConHuella(usuario: string, hashHex: string) {
  const ids = await credencialesDe(usuario);
  if (!ids.length) throw new Error('SIN_CREDENCIAL');
  return startAuthentication({
    challenge: bytesABase64Url(hexABytes(hashHex)), rpId: window.location.hostname, timeout: 60_000, userVerification: 'required',
    allowCredentials: ids.map((id) => ({ id, type: 'public-key' as const, transports: ['internal' as const] })),
  });
}
