import { api, auth, prepararBase, prisma, token } from './helpers';
import { sincronizarDesdeSua } from '../src/services/solicitudes';

beforeAll(prepararBase);
afterAll(() => prisma.$disconnect());

describe('Auditoría (RF-54, RF-55)', () => {
  it('el Administrador filtra por usuario, acción y fechas; otros roles no acceden', async () => {
    const admin = await token('asuarez0');
    await api().post('/api/usuarios/lfernan0/revocar-captor').set(auth(admin)).send({}); // genera eventos
    const todos = await api().get('/api/auditoria').set(auth(admin));
    expect(todos.status).toBe(200);
    expect(todos.body.total).toBeGreaterThan(0);
    const porAccion = await api().get('/api/auditoria?accion=revocaci%C3%B3n').set(auth(admin));
    expect(porAccion.body.items.length).toBeGreaterThan(0);
    expect(porAccion.body.items.every((a: any) => /revocación/i.test(a.accion))).toBe(true);
    const hoy = new Date().toISOString().slice(0, 10);
    expect((await api().get(`/api/auditoria?usuario=asuarez0&desde=${hoy}&hasta=${hoy}`).set(auth(admin))).body.items.every((a: any) => a.nombre_usuario === 'asuarez0')).toBe(true);
    expect((await api().get('/api/auditoria?desde=2000-01-01&hasta=2000-01-02').set(auth(admin))).body.total).toBe(0);
    expect((await api().get('/api/auditoria?desde=ayer').set(auth(admin))).status).toBe(422);
    expect((await api().get('/api/auditoria').set(auth(await token('pgimene0')))).status).toBe(403);
  });
});

describe('Dashboard (RF-35 a RF-37, RF-44)', () => {
  it('cuenta derivadas, dictaminadas y sin dictaminar; las re-derivaciones son eventos independientes; tormenta aparte', async () => {
    const jefe = await token('pgimene0');
    const anual = await api().get('/api/dashboard?anio=2026').set(auth(jefe));
    expect(anual.status).toBe(200);
    const { general, tormenta } = anual.body;
    expect(general.derivadas).toBe(general.dictaminadas + general.sin_dictaminar);
    const eventos = await prisma.historialDerivacion.count({ where: { fecha_derivacion: { gte: new Date('2026-01-01'), lt: new Date('2027-01-01') } } });
    expect(general.derivadas).toBe(eventos); // RF-37: cada evento cuenta, aunque sea el mismo SUA-Año
    const distintas = await prisma.historialDerivacion.groupBy({ by: ['numero_sua', 'anio'], where: { fecha_derivacion: { gte: new Date('2026-01-01'), lt: new Date('2027-01-01') } } });
    expect(await prisma.historialDerivacion.count()).toBeGreaterThan(await prisma.solicitud.count());
    expect(eventos).toBeGreaterThanOrEqual(distintas.length);
    const nTormenta = await prisma.historialDerivacion.count({ where: { solicitud: { es_tormenta: true }, fecha_derivacion: { gte: new Date('2026-01-01'), lt: new Date('2027-01-01') } } });
    expect(tormenta.derivadas).toBe(nTormenta);
    expect(nTormenta).toBeGreaterThan(0);
    expect(general.derivadas).toBeGreaterThanOrEqual(tormenta.derivadas); // RF-44: incluidas en el general
    expect(general.dictaminadas).toBeGreaterThan(0);
    // Series para los gráficos: la suma por mes, por prioridad y por distrito coincide con el total.
    const suma = (xs: any[], k: string) => xs.reduce((a, m) => a + m[k], 0);
    expect(anual.body.por_mes).toHaveLength(12);
    for (const grupo of [anual.body.por_mes, Object.values(anual.body.por_prioridad), Object.values(anual.body.por_distrito)] as any[][]) {
      expect(suma(grupo, 'derivadas')).toBe(general.derivadas);
      expect(suma(grupo, 'dictaminadas')).toBe(general.dictaminadas);
    }
    expect(Object.keys(anual.body.por_prioridad).every((k) => ['Alta', 'Media', 'Baja'].includes(k))).toBe(true);
  });

  it('filtra por mes y año; Operador sin acceso; Lector y Administrador sí', async () => {
    const lector = await token('tmolina0');
    const ago = await api().get('/api/dashboard?anio=2026&mes=8').set(auth(lector));
    const sep = await api().get('/api/dashboard?anio=2026&mes=9').set(auth(lector));
    const anual = await api().get('/api/dashboard?anio=2026').set(auth(lector));
    expect(ago.body.general.derivadas + sep.body.general.derivadas).toBeLessThanOrEqual(anual.body.general.derivadas);
    expect((await api().get('/api/dashboard?anio=2019').set(auth(lector))).body.general.derivadas).toBe(0);
    expect((await api().get('/api/dashboard?mes=13').set(auth(lector))).status).toBe(422);
    expect((await api().get('/api/dashboard').set(auth(await token('mrossi0')))).status).toBe(403);
    expect((await api().get('/api/dashboard').set(auth(await token('asuarez0')))).status).toBe(200);
  });
});

describe('Protocolo por tormenta (RF-38 a RF-43)', () => {
  it('lista solo tormenta, indica pendientes y no aparecen en el listado general', async () => {
    const t = await token('mrossi0');
    const r = await api().get('/api/tormenta').set(auth(t));
    expect(r.body.hay_pendientes).toBe(true);
    expect(r.body.solicitudes.every((s: any) => s.es_tormenta)).toBe(true);
    const general = await api().get('/api/solicitudes').set(auth(t));
    expect(general.body.some((s: any) => s.es_tormenta)).toBe(false);
    expect((await api().get('/api/tormenta').set(auth(await token('tmolina0')))).status).toBe(200); // Lector puede ver (RF-38)
  });

  it('ruta de tormenta: solo cantidad, más antiguas primero, y sus reservas excluyen a las rutas de otros', async () => {
    const t = await token('mrossi0');
    const lista = (await api().get('/api/tormenta').set(auth(t))).body.solicitudes.filter((s: any) => !s.sin_ubicar);
    const r = await api().post('/api/tormenta/rutas').set(auth(t)).send({ modo: 'Vehículo', total: 3 });
    expect(r.status).toBe(201);
    expect(r.body.tipo).toBe('Tormenta');
    expect(r.body.solicitudes).toHaveLength(3);
    const fechas = lista.map((s: any) => s.fecha_ultima_derivacion).sort();
    const elegidas = r.body.solicitudes.map((s: any) => lista.find((x: any) => x.numero_sua === s.numero_sua).fecha_ultima_derivacion);
    expect(Math.max(...elegidas.map((f: string) => Date.parse(f)))).toBeLessThanOrEqual(Date.parse(fechas[2]) + 2 * 86400000);
    const otro = await api().post('/api/tormenta/rutas').set(auth(await token('pgimene0'))).send({ modo: 'Caminando', total: 100 });
    const tomadas = new Set(r.body.solicitudes.map((s: any) => s.numero_sua));
    expect(otro.body.solicitudes.some((s: any) => tomadas.has(s.numero_sua))).toBe(false); // RF-42 / RF-16
    expect((await api().post('/api/tormenta/rutas').set(auth(await token('tmolina0'))).send({ modo: 'Caminando', total: 1 })).status).toBe(403);
    expect((await api().post('/api/tormenta/rutas').set(auth(await token('asuarez0'))).send({ modo: 'Caminando', total: 0 })).status).toBe(403);
  });
});

describe('Validación de datos del SUA (RNF-18, RF-58)', () => {
  it('un registro inválido no se incorpora y queda en "Para revisar"', async () => {
    const base = await prisma.solicitudSua.findFirstOrThrow();
    const { numero_sua: _n, ...resto } = base as any;
    await prisma.solicitudSua.create({ data: { ...resto, numero_sua: '77001', distrito: 'Zona Franca' } });
    await prisma.solicitudSua.create({ data: { ...resto, numero_sua: '77002', direccion: '<script>alert(1)</script>' } });
    await prisma.solicitudSua.create({ data: { ...resto, numero_sua: '77003', direccion: 'Mitre 1200, Rosario' } });
    const antes = await prisma.solicitud.count();
    const r = await sincronizarDesdeSua();
    expect(r.rechazadas).toBe(2);
    expect(r.nuevas).toBe(1);
    expect(await prisma.solicitud.count()).toBe(antes + 1);
    await sincronizarDesdeSua(); // idempotente: no duplica casos
    const casos = await api().get('/api/revision').set(auth(await token('asuarez0')));
    const invalidos = casos.body.filter((c: any) => c.tipo === 'Datos inválidos del SUA' && /^7700[12]-/.test(c.referencia_solicitud));
    expect(invalidos).toHaveLength(2);
    expect(invalidos.find((c: any) => c.referencia_solicitud.startsWith('77001')).motivo).toMatch(/distrito/);
    expect((await api().get('/api/revision').set(auth(await token('pgimene0')))).status).toBe(403);
    expect((await api().post('/api/revision').set(auth(await token('asuarez0'))).send({})).status).toBe(404); // solo lectura
  });
});
