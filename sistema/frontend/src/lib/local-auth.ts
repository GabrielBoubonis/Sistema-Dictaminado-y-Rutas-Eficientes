import { db, type SesionLocal } from './db';

// Verificador de contraseña local para reanudar sin señal (RF-57). Nunca se guarda la contraseña: solo PBKDF2.
const ITER = 150_000;
async function derivar(password: string, salt: Uint8Array): Promise<ArrayBuffer> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new Uint8Array(salt), iterations: ITER }, base, 256);
}
const igual = (a: ArrayBuffer, b: ArrayBuffer) => { const x = new Uint8Array(a), y = new Uint8Array(b); return x.length === y.length && x.every((v, i) => v === y[i]); };
export const mismoDia = (a: number, b: number) => new Date(a).toLocaleDateString('es-AR') === new Date(b).toLocaleDateString('es-AR');
const SIETE_DIAS = 7 * 24 * 3600 * 1000;

export async function guardarSesionLocal(usuario: string, nombre_completo: string, rol: string, password: string) {
  const previa = await db.sesiones.get(usuario);
  const ahora = Date.now();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const sesion: SesionLocal = {
    usuario, nombre_completo, rol, salt, verificador: await derivar(password, salt), ultimoLoginOnline: ahora,
    // el tope de 7 días corre desde el primer ingreso de la cadena (RNF-20)
    inicioCadena: previa && ahora - previa.inicioCadena < SIETE_DIAS ? previa.inicioCadena : ahora,
  };
  await db.sesiones.put(sesion);
}

export type ResultadoReanudar =
  | { ok: true; sesion: SesionLocal }
  | { ok: false; motivo: 'sin_sesion' | 'password' | 'otro_dia' | 'tope_7_dias' };

/** RF-57: reanudar sin conexión con la contraseña local, solo si hubo login con conexión el mismo día y no pasaron 7 días. */
export async function reanudarSinConexion(usuario: string, password: string, ahora = Date.now()): Promise<ResultadoReanudar> {
  const s = await db.sesiones.get(usuario);
  if (!s) return { ok: false, motivo: 'sin_sesion' };
  if (!igual(await derivar(password, s.salt), s.verificador)) return { ok: false, motivo: 'password' };
  if (ahora - s.inicioCadena >= SIETE_DIAS) return { ok: false, motivo: 'tope_7_dias' };
  if (!mismoDia(s.ultimoLoginOnline, ahora)) return { ok: false, motivo: 'otro_dia' };
  return { ok: true, sesion: s };
}

export const MENSAJES_REANUDAR: Record<string, string> = {
  sin_sesion: 'Este usuario nunca ingresó con conexión en este captor. Necesitás señal para el primer ingreso.',
  password: 'Usuario o contraseña incorrectos',
  otro_dia: 'Solo se puede reanudar sin señal el mismo día del último ingreso con conexión. Conectate para ingresar.',
  tope_7_dias: 'Pasaron más de 7 días desde tu primer ingreso. Conectate para ingresar de nuevo.',
};

/** Código corto del captor (RF-60). Misma derivación que el servidor (backend/src/security.ts), para mostrarlo sin señal. */
export async function codigoDispositivo(id: string): Promise<string> {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(id)));
  let s = '';
  for (let i = 0; i < 8; i++) s += alfabeto[h[i] % alfabeto.length];
  return s.slice(0, 4) + '-' + s.slice(4);
}
