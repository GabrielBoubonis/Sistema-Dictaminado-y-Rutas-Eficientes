import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { api, auth, PASS, prepararBase, prisma, randomUUID, token } from './helpers';
import { SoftAuthenticator } from './soft-authenticator';
import { calcularHash } from '../src/services/registro-dictamen';
import { dictamenSchema } from '../src/services/dictamenes';
import { config } from '../src/config';

/**
 * RNF-02, RNF-03 y RNF-15: una jornada completa con 7 ingenieros a la vez (70 dictámenes) y la resolución de 100
 * solicitudes de tormenta. Mide cada pedido; el umbral de "sin degradación perceptible" es 2 s para el 95 % de los
 * pedidos y ninguno por encima de los 10 s de RNF-04. Corre contra PostgreSQL real, con la matriz simulada.
 */
const FOTO = fs.readFileSync(path.join(__dirname, '../../../datos-prueba/fotos/foto-prueba-1.jpg')).toString('base64');
const INGENIEROS = ['mrossi0', 'cbenite0', 'lfernan0', 'pgimene0', 'carga10', 'carga20', 'carga30'];
const P95_MS = 2000;

afterAll(() => prisma.$disconnect());
beforeAll(async () => {
  await prepararBase();
  const hash = bcrypt.hashSync(PASS, 4);
  for (const u of INGENIEROS.slice(4)) {
    await prisma.usuarioInstitucional.create({ data: { nombre_usuario: u, vigente: true, nombre_completo: `Ingeniero ${u}` } });
    await prisma.usuario.create({ data: { nombre_usuario: u, nombre_completo: `Ingeniero ${u}`, contrasena_hash: hash, rol: 'Operador' } });
  }
  // 70 solicitudes normales y 100 de tormenta repartidas alrededor de la sede, derivadas en los últimos días.
  const nueva = (i: number, tormenta: boolean) => ({
    numero_sua: String((tormenta ? 80000 : 70000) + i), anio: 2026, distrito: 'Centro', prioridad: 'Alta',
    direccion: `Calle de carga ${i}`, latitud: config.sede.lat + ((i % 10) - 5) * 0.003, longitud: config.sede.lng + (Math.floor(i / 10) - 5) * 0.003,
    descripcion_reclamo: 'Carga', estado: 'Pendiente', es_tormenta: tormenta, fecha_ultima_derivacion: new Date(Date.UTC(2026, 9, 1 + (i % 5))),
  });
  await prisma.solicitud.createMany({ data: [...Array.from({ length: 70 }, (_, i) => nueva(i, false)), ...Array.from({ length: 100 }, (_, i) => nueva(i, true))] });
});

const tiempos: number[] = [];
async function medido<T>(pedido: PromiseLike<T>): Promise<T> {
  const t0 = performance.now();
  const r = await pedido;
  tiempos.push(performance.now() - t0);
  return r;
}
const p95 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length * 0.95)];

function dictamen(usuario: string, s: { numero_sua: string; anio: number }) {
  const d: any = {
    uuid_dictamen: randomUUID(), fecha_firma: new Date().toISOString(), numero_sua: s.numero_sua, anio: s.anio,
    fecha_emision: new Date().toISOString().slice(0, 10), domicilio_ejemplar: 'Calle de carga', latitud_ejemplar: -32.96, longitud_ejemplar: -60.65,
    id_especie: 1, nivel_dano_vereda: 'Bajo', es_extraccion: false, es_sin_trabajo: false, trabajos_aereos: ['Liberación de conductores eléctricos'],
    trabajos_subterraneos: [], complejidad: 'Baja', urgente: false, arbol_frente_garage: false, media_tension: false, de_oficio: false,
    nivel_prioridad: 'Baja', fotos: [{ contenido_base64: FOTO }],
  };
  d.hash_firma = calcularHash(dictamenSchema.parse(d), usuario).hash;
  return d;
}

/** Un ingeniero: inicia sesión, registra la huella, genera su ruta y firma uno por uno los dictámenes de la ruta. */
async function jornada(usuario: string, generar: (t: string) => PromiseLike<any>) {
  const t = await token(usuario);
  const a = new SoftAuthenticator();
  const o = await medido(api().post('/api/auth/webauthn/registro/opciones').set(auth(t)));
  expect((await medido(api().post('/api/auth/webauthn/registro/verificar').set(auth(t)).send(a.registrar(o.body.challenge)))).status).toBe(200);
  const ruta = await medido(generar(t));
  expect(ruta.status).toBe(201);
  for (const s of ruta.body.solicitudes) {
    const d = dictamen(usuario, s);
    const r = await medido(api().post('/api/dictamenes').set(auth(t)).send({ ...d, segundo_factor: a.firmar(d.hash_firma) }));
    expect(r.status).toBe(201);
  }
  return ruta.body.solicitudes.length as number;
}

describe('Carga (RNF-02, RNF-03, RNF-15)', () => {
  it('7 ingenieros a la vez: rutas de 10 y 70 dictámenes firmados sin degradación', async () => {
    tiempos.length = 0;
    const inicio = new Date();
    const firmados = await Promise.all(INGENIEROS.map((u) =>
      jornada(u, (t) => api().post('/api/rutas').set(auth(t)).send({ modo: 'Caminando', distrito: 'Centro', cantidades: { Alta: 10 } }))));
    expect(firmados.reduce((a, b) => a + b, 0)).toBe(70);
    // Pueden incluir solicitudes de los datos de prueba más antiguas (RF-47): se cuentan los dictámenes de esta jornada.
    expect(await prisma.dictamen.count({ where: { nombre_usuario: { in: INGENIEROS }, fecha_firma: { gte: inicio } } })).toBe(70);
    console.log(`RNF-02/03: ${tiempos.length} pedidos, p95 ${Math.round(p95(tiempos))} ms, máximo ${Math.round(Math.max(...tiempos))} ms`);
    expect(p95(tiempos)).toBeLessThan(P95_MS);
    expect(Math.max(...tiempos)).toBeLessThan(10_000);
  }, 180_000);

  it('100 solicitudes de tormenta resueltas por los 7 ingenieros, de a 15 por ruta', async () => {
    tiempos.length = 0;
    const inicio = Date.now();
    let resueltas = 0;
    while (resueltas < 100) {
      const ronda = await Promise.all(INGENIEROS.map(async (u) => {
        if (resueltas >= 100) return 0;
        return jornada(u, (t) => api().post('/api/tormenta/rutas').set(auth(t)).send({ modo: 'Vehículo', total: 15 })).catch(() => 0);
      }));
      const n = ronda.reduce((a, b) => a + b, 0);
      if (!n) break;
      resueltas += n;
    }
    expect(await prisma.solicitud.count({ where: { es_tormenta: true, numero_sua: { startsWith: '8' }, estado: 'Dictaminada' } })).toBe(100);
    console.log(`RNF-15: 100 de tormenta en ${Math.round((Date.now() - inicio) / 1000)} s de servidor, p95 ${Math.round(p95(tiempos))} ms`);
    expect(p95(tiempos)).toBeLessThan(P95_MS);
  }, 300_000);
});
