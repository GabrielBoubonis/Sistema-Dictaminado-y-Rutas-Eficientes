process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/arbolado_test';
process.env.BCRYPT_COST = '4';
process.env.GEOCODER = 'mock';
process.env.ORS_API_KEY = ''; // los tests usan la matriz simulada aunque el .env tenga una clave real
process.env.JWT_SECRET = 'test-secret';
process.env.UPLOADS_DIR = require('os').tmpdir() + '/arbolado-test-uploads';

import request from 'supertest';
import { randomUUID } from 'crypto';
import { createApp } from '../src/app';
import { prisma } from '../src/db';
import { seed } from '../src/seed';
import { throttle } from '../src/middleware/throttle';
import { providers, MockAuthProvider, MockMatriz, MockGeocoder } from '../src/providers';

// Los tests no dependen del .env local: WebAuthn toma rpId y origen del pedido (el autenticador de prueba usa localhost:5173).
delete process.env.WEBAUTHN_RP_ID;
delete process.env.WEBAUTHN_ORIGIN;

export const app = createApp();
export const api = () => request(app);
export const PASS = 'Demo2026!';

export async function prepararBase() {
  await seed({ bcryptCost: 4 });
  throttle.reset();
  (providers.auth as MockAuthProvider).caido = false;
  (providers.matriz as MockMatriz).caido = false;
  (providers.geocoder as MockGeocoder).falla = false;
}

export async function login(usuario: string, password = PASS, dispositivoId?: string) {
  const r = await api().post('/api/auth/login').send({ usuario, password, dispositivoId });
  return r;
}

export async function token(usuario: string, dispositivoId?: string): Promise<string> {
  const r = await login(usuario, PASS, dispositivoId);
  if (r.status !== 200) throw new Error(`login ${usuario} falló: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.accessToken;
}

export const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
export { prisma, randomUUID, providers, throttle };
