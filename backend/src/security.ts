import crypto from 'crypto';
import helmet from 'helmet';

/** JSON canónico: claves ordenadas, sin espacios (arquitectura-tecnica.md §4). */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJson(obj[k])).join(',') + '}';
}

export const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

/** RNF-21: CSP default-src 'self', HSTS, X-Frame-Options DENY. */
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'blob:', 'https://*.tile.openstreetmap.org'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'", 'https://api.openrouteservice.org'],
      workerSrc: ["'self'", 'blob:'],
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true },
  frameguard: { action: 'deny' },
  crossOriginEmbedderPolicy: false,
});

/** Código corto del captor, derivado de su UUID (RF-60): 8 caracteres sin ambiguos, formato XXXX-XXXX. */
export function codigoDispositivo(id: string, salt = ''): string {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const h = crypto.createHash('sha256').update(id + salt).digest();
  let s = '';
  for (let i = 0; i < 8; i++) s += alfabeto[h[i] % alfabeto.length];
  return s.slice(0, 4) + '-' + s.slice(4);
}

const POLITICA = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
/** RNF-05: mínimo 8 caracteres, mayúscula, minúscula, número y carácter especial. */
export const contrasenaValida = (p: string) => POLITICA.test(p);
