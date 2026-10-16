// Cliente de la API. Maneja el access token (30 min) y su renovación con el refresh token (RF-04, RNF-20).
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public body: any = {}) { super(message); }
}
export class ErrorRed extends Error { constructor() { super('Sin conexión con el servidor'); } }

type Tokens = { accessToken: string; refreshToken: string };
let tokens: Tokens | null = null;
const KEY = 'refreshToken';
const oyentes = new Set<(e: 'sesion-finalizada' | 'red-ok' | 'red-caida') => void>();
export const onApiEvento = (f: (e: 'sesion-finalizada' | 'red-ok' | 'red-caida') => void) => { oyentes.add(f); return () => { oyentes.delete(f); }; };
const emitir = (e: 'sesion-finalizada' | 'red-ok' | 'red-caida') => oyentes.forEach((f) => f(e));

export function setTokens(t: Tokens | null) {
  tokens = t;
  try { t ? localStorage.setItem(KEY, t.refreshToken) : localStorage.removeItem(KEY); } catch { /* sin almacenamiento */ }
}
export const refreshGuardado = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
export const hayToken = () => !!tokens;

/** RNF-04: ningún pedido HTTP espera más de 10 s; si no hubo respuesta se trata como falta de conexión. */
export const TIEMPO_LIMITE_MS = 10_000;
export async function fetchConLimite(url: string, init: RequestInit = {}): Promise<Response> {
  const corte = new AbortController();
  const reloj = setTimeout(() => corte.abort(), TIEMPO_LIMITE_MS);
  try { return await fetch(url, { ...init, signal: corte.signal }); } finally { clearTimeout(reloj); }
}

async function crudo(path: string, init: RequestInit & { sinAuth?: boolean } = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (tokens && !init.sinAuth) headers.set('Authorization', `Bearer ${tokens.accessToken}`);
  try {
    const r = await fetchConLimite('/api' + path, { ...init, headers });
    emitir('red-ok');
    return r;
  } catch {
    emitir('red-caida');
    throw new ErrorRed();
  }
}

let renovando: Promise<boolean> | null = null;
export async function renovar(): Promise<boolean> {
  const rt = tokens?.refreshToken ?? refreshGuardado();
  if (!rt) return false;
  renovando ??= (async () => {
    try {
      const r = await crudo('/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken: rt }), sinAuth: true });
      if (!r.ok) return false;
      setTokens(await r.json());
      return true;
    } catch { return false; } finally { renovando = null; }
  })();
  return renovando;
}

async function leer(r: Response) {
  const texto = await r.text();
  let cuerpo: any = {};
  try { cuerpo = texto ? JSON.parse(texto) : {}; } catch { cuerpo = { texto }; }
  if (!r.ok) throw new ApiError(r.status, cuerpo.error ?? 'error', cuerpo.mensaje ?? `Error ${r.status}`, cuerpo);
  return cuerpo;
}

export async function api<T = any>(path: string, init: { method?: string; body?: unknown; sinAuth?: boolean } = {}): Promise<T> {
  const opciones = { method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'), body: init.body !== undefined ? JSON.stringify(init.body) : undefined, sinAuth: init.sinAuth };
  const sesionAlPedir = tokens; // un 401 tardío de una sesión anterior no debe cerrar la sesión nueva
  let r = await crudo(path, opciones);
  if (r.status === 401 && !init.sinAuth && sesionAlPedir) {
    const cuerpo = await r.clone().json().catch(() => ({}));
    const vigente = () => tokens === sesionAlPedir || (tokens !== null && tokens.refreshToken === sesionAlPedir.refreshToken);
    if (cuerpo.error === 'sesion_finalizada') { if (vigente()) emitir('sesion-finalizada'); return leer(r); }
    if (await renovar()) r = await crudo(path, opciones);
    else if (vigente()) emitir('sesion-finalizada');
  }
  return leer(r);
}

/** Descarga un recurso binario autenticado (PDF, fotos) y devuelve una URL de objeto. */
export async function descargarBlob(path: string): Promise<string> {
  let r = await crudo(path);
  if (r.status === 401 && (await renovar())) r = await crudo(path);
  if (!r.ok) throw new ApiError(r.status, 'error', 'No se pudo descargar');
  return URL.createObjectURL(await r.blob());
}
