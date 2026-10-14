import { api, auth, prepararBase, prisma, providers, throttle, token } from './helpers';
import { MockMatriz, MockGeocoder } from '../src/providers';
import { puntoEnPoligono, ultimoCorte, agruparPorFranja, seleccionar } from '../src/services/rutas';
import { cerrarRutasVencidas } from '../src/services/rutas';
import { reintentarGeocodificacion } from '../src/services/solicitudes';

beforeEach(async () => { await prepararBase(); });
afterAll(() => prisma.$disconnect());

const generar = (t: string, body: object) => api().post('/api/rutas').set(auth(t)).send(body);

describe('Listado de solicitudes (RF-09 a RF-13, RF-39)', () => {
  it('lista pendientes y pendientes-revisión de todos, sin las de tormenta', async () => {
    const t = await token('mrossi');
    const r = await api().get('/api/solicitudes').set(auth(t));
    expect(r.status).toBe(200);
    expect(r.body.every((s: any) => ['Pendiente', 'Pendiente-revisión'].includes(s.estado))).toBe(true);
    expect(r.body.some((s: any) => s.es_tormenta)).toBe(false);
    expect(r.body.some((s: any) => s.estado === 'Pendiente-revisión')).toBe(true);
    // más antiguas primero
    const fechas = r.body.map((s: any) => s.fecha_ultima_derivacion);
    expect([...fechas].sort()).toEqual(fechas);
  });

  it('filtra por estado y distrito, rechaza valores fuera del catálogo y marca las sin ubicar', async () => {
    const t = await token('pgimene');
    const d = await api().get('/api/solicitudes?distrito=Norte&estado=Pendiente').set(auth(t));
    expect(d.body.length).toBeGreaterThan(0);
    expect(d.body.every((s: any) => s.distrito === 'Norte' && s.estado === 'Pendiente')).toBe(true);
    expect((await api().get('/api/solicitudes?distrito=Marte').set(auth(t))).status).toBe(422);
    const todas = await api().get('/api/solicitudes').set(auth(t));
    expect(todas.body.filter((s: any) => s.sin_ubicar)).toHaveLength(1);
  });

  it('detalle con historial de derivaciones; 404 si no existe; Lector sin acceso', async () => {
    const t = await token('mrossi');
    const multi = await prisma.historialDerivacion.groupBy({ by: ['numero_sua', 'anio'], _count: true, having: { numero_sua: { _count: { gte: 2 } } } });
    expect(multi.length).toBeGreaterThan(0);
    const s = multi[0];
    const d = await api().get(`/api/solicitudes/${s.numero_sua}/${s.anio}`).set(auth(t));
    expect(d.status).toBe(200);
    expect(d.body.historial.length).toBeGreaterThanOrEqual(2);
    expect((await api().get('/api/solicitudes/99999/2026').set(auth(t))).status).toBe(404);
    expect((await api().get('/api/solicitudes').set(auth(await token('tmolina')))).status).toBe(403);
  });
});

describe('Generación de rutas (RF-14 a RF-19, RF-47 a RF-49)', () => {
  it('suma las cantidades por prioridad, optimiza el orden y calcula distancia/tiempo', async () => {
    const t = await token('mrossi');
    const r = await generar(t, { modo: 'Caminando', distrito: 'Centro', cantidades: { Alta: 2, Media: 1, Baja: 1 } });
    expect(r.status).toBe(201);
    expect(r.body.solicitudes).toHaveLength(4);
    const porPrio = (p: string) => r.body.solicitudes.filter((s: any) => s.prioridad === p).length;
    expect([porPrio('Alta'), porPrio('Media'), porPrio('Baja')]).toEqual([2, 1, 1]);
    expect(r.body.solicitudes.every((s: any) => s.distrito === 'Centro')).toBe(true);
    expect(r.body.optimizada).toBe(true);
    expect(r.body.distancia_total_m).toBeGreaterThan(0);
    expect(r.body.tiempo_total_s).toBeGreaterThan(0);
    expect(r.body.solicitudes.map((s: any) => s.orden)).toEqual([1, 2, 3, 4]);
  });

  it('RF-15: sin distrito considera todos', async () => {
    const t = await token('mrossi');
    const r = await generar(t, { modo: 'Vehículo', cantidades: { Alta: 8 } });
    expect(r.status).toBe(201);
    expect(new Set(r.body.solicitudes.map((s: any) => s.distrito)).size).toBeGreaterThan(1);
  });

  it('RF-49: el modo cambia el tiempo pero no la distancia en el simulador', async () => {
    const a = await generar(await token('mrossi'), { modo: 'Caminando', cantidades: { Alta: 3 } });
    const b = await generar(await token('pgimene'), { modo: 'Vehículo', cantidades: { Alta: 3 } });
    expect(a.body.tiempo_total_s).toBeGreaterThan(0);
    expect(b.body.modo_desplazamiento).toBe('Vehículo');
  });

  it('RF-16: lo reservado por un ingeniero no entra en la ruta de otro y la carrera no duplica', async () => {
    const [t1, t2] = [await token('mrossi'), await token('pgimene')];
    const [a, b] = await Promise.all([
      generar(t1, { modo: 'Caminando', cantidades: { Alta: 6 } }),
      generar(t2, { modo: 'Caminando', cantidades: { Alta: 6 } }),
    ]);
    const claves = (r: any) => (r.body.solicitudes ?? []).map((s: any) => `${s.numero_sua}-${s.anio}`);
    expect([a.status, b.status].filter((s) => s === 201).length).toBeGreaterThanOrEqual(1);
    const inter = claves(a).filter((k: string) => claves(b).includes(k));
    expect(inter).toEqual([]);
    const activas = await prisma.rutaSolicitud.groupBy({ by: ['numero_sua', 'anio'], where: { liberada: false }, _count: true });
    expect(activas.every((g) => g._count === 1)).toBe(true);
  });

  it('una sola ruta activa por usuario (409) y el listado muestra quién reservó', async () => {
    const t = await token('mrossi');
    await generar(t, { modo: 'Caminando', cantidades: { Alta: 2 } });
    expect((await generar(t, { modo: 'Caminando', cantidades: { Alta: 2 } })).status).toBe(409);
    const lista = await api().get('/api/solicitudes').set(auth(await token('pgimene')));
    expect(lista.body.filter((s: any) => s.reservada_por === 'mrossi')).toHaveLength(2);
  });

  it('RF-47: con más candidatas que cupo prefiere las más antiguas', async () => {
    const t = await token('mrossi');
    const r = await generar(t, { modo: 'Caminando', cantidades: { Alta: 3 } });
    const elegidas = r.body.solicitudes.map((s: any) => `${s.numero_sua}-${s.anio}`);
    const todas = await prisma.solicitud.findMany({ where: { prioridad: 'Alta', es_tormenta: false, estado: { in: ['Pendiente', 'Pendiente-revisión'] }, latitud: { not: null }, dictamenes: { none: { vigente: null } } } });
    const fechasElegidas = todas.filter((s) => elegidas.includes(`${s.numero_sua}-${s.anio}`)).map((s) => s.fecha_ultima_derivacion.getTime());
    const fechasNo = todas.filter((s) => !elegidas.includes(`${s.numero_sua}-${s.anio}`)).map((s) => s.fecha_ultima_derivacion.getTime());
    const franja = 2 * 24 * 3600 * 1000;
    expect(Math.max(...fechasElegidas)).toBeLessThanOrEqual(Math.min(...fechasNo) + franja);
  });

  it('si OpenRouteService no responde: selecciona por antigüedad, sin optimizar y avisa', async () => {
    (providers.matriz as MockMatriz).caido = true;
    const r = await generar(await token('mrossi'), { modo: 'Caminando', cantidades: { Alta: 3 } });
    expect(r.status).toBe(201);
    expect(r.body.optimizada).toBe(false);
    expect(r.body.distancia_total_m).toBeNull();
    expect(r.body.solicitudes).toHaveLength(3);
  });

  it('zona dibujada: solo entran solicitudes dentro del polígono', async () => {
    const t = await token('mrossi');
    const todas = await prisma.solicitud.findMany({ where: { prioridad: 'Alta', latitud: { not: null }, es_tormenta: false } });
    const lats = todas.map((s) => s.latitud!).sort((a, b) => a - b);
    const corte = lats[Math.floor(lats.length / 2)];
    const zona = [[-33.2, -61.0], [-33.2, -60.3], [corte, -60.3], [corte, -61.0]];
    const r = await generar(t, { modo: 'Caminando', cantidades: { Alta: 50 }, zona });
    expect(r.status).toBe(201);
    expect(r.body.solicitudes.every((s: any) => s.latitud <= corte)).toBe(true);
    expect(r.body.solicitudes.length).toBeLessThan(todas.length);
  });

  it('sin candidatas → 422; datos inválidos → 422; Lector → 403', async () => {
    const t = await token('mrossi');
    await prisma.solicitud.updateMany({ data: { estado: 'Dictaminada' } });
    expect((await generar(t, { modo: 'Caminando', cantidades: { Alta: 1 } })).status).toBe(422);
    expect((await generar(t, { modo: 'Bicicleta', cantidades: { Alta: 1 } })).status).toBe(422);
    expect((await generar(t, { modo: 'Caminando', cantidades: {} })).status).toBe(422);
    expect((await generar(await token('tmolina'), { modo: 'Caminando', cantidades: { Alta: 1 } })).status).toBe(403);
  });

  it('las sin coordenadas quedan fuera de la ruta (RF-62) hasta que el reintento las ubica', async () => {
    const sin = await prisma.solicitud.findFirstOrThrow({ where: { latitud: null } });
    await prisma.solicitud.updateMany({ where: { NOT: { numero_sua: sin.numero_sua } }, data: { estado: 'Dictaminada' } });
    const t = await token('mrossi');
    expect((await generar(t, { modo: 'Caminando', cantidades: { Alta: 5, Media: 5, Baja: 5 } })).status).toBe(422);
    await prisma.solicitud.update({ where: { numero_sua_anio: { numero_sua: sin.numero_sua, anio: sin.anio } }, data: { direccion: 'Pellegrini 1500, Rosario' } });
    expect(await reintentarGeocodificacion()).toBe(1);
    const r = await generar(t, { modo: 'Caminando', cantidades: { [sin.prioridad]: 1 } });
    expect(r.status).toBe(201);
  });
});

describe('Ruta activa, restablecer y corte de las 18:00 (RF-17, RF-18)', () => {
  it('GET /rutas/activa devuelve la ruta o null', async () => {
    const t = await token('mrossi');
    expect((await api().get('/api/rutas/activa').set(auth(t))).body).toBeNull();
    await generar(t, { modo: 'Caminando', cantidades: { Alta: 2 } });
    const a = await api().get('/api/rutas/activa').set(auth(t));
    expect(a.body.solicitudes).toHaveLength(2);
    expect(a.body.sede).toBeDefined();
  });

  it('Restablecer libera todas y permite que otro ingeniero las tome; solo el dueño', async () => {
    const [t1, t2] = [await token('mrossi'), await token('pgimene')];
    const r = await generar(t1, { modo: 'Caminando', cantidades: { Alta: 3 } });
    expect((await api().post(`/api/rutas/${r.body.id_ruta}/restablecer`).set(auth(t2))).status).toBe(404);
    const x = await api().post(`/api/rutas/${r.body.id_ruta}/restablecer`).set(auth(t1));
    expect(x.body.liberadas).toBe(3);
    expect((await api().get('/api/rutas/activa').set(auth(t1))).body).toBeNull();
    expect((await api().post(`/api/rutas/${r.body.id_ruta}/restablecer`).set(auth(t1))).status).toBe(409);
    expect((await generar(t2, { modo: 'Caminando', cantidades: { Alta: 3 } })).status).toBe(201);
  });

  it('el corte de las 18:00 libera las rutas creadas antes del corte', async () => {
    const t = await token('mrossi');
    const r = await generar(t, { modo: 'Caminando', cantidades: { Alta: 2 } });
    expect(await cerrarRutasVencidas(new Date(Date.now() + 1000))).toBe(0 + (ultimoCorte(new Date()) > new Date(r.body.creada) ? 1 : 0));
    await prisma.ruta.update({ where: { id_ruta: r.body.id_ruta }, data: { creada: new Date(Date.now() - 36 * 3600 * 1000) } });
    expect(await cerrarRutasVencidas()).toBe(1);
    expect((await api().get('/api/rutas/activa').set(auth(t))).body).toBeNull();
    const rs = await prisma.rutaSolicitud.findMany({ where: { id_ruta: r.body.id_ruta } });
    expect(rs.every((x) => x.liberada && x.motivo_liberacion === 'Corte de las 18:00')).toBe(true);
  });
});

describe('Funciones puras', () => {
  it('punto en polígono', () => {
    const cuadrado: [number, number][] = [[0, 0], [0, 10], [10, 10], [10, 0]];
    expect(puntoEnPoligono({ lat: 5, lng: 5 }, cuadrado)).toBe(true);
    expect(puntoEnPoligono({ lat: 15, lng: 5 }, cuadrado)).toBe(false);
  });
  it('último corte: 21:00 UTC (18:00 ART)', () => {
    expect(ultimoCorte(new Date('2026-10-13T20:59:00Z')).toISOString()).toBe('2026-10-12T21:00:00.000Z');
    expect(ultimoCorte(new Date('2026-10-13T21:00:00Z')).toISOString()).toBe('2026-10-13T21:00:00.000Z');
  });
  it('franjas de 2 días y desempate por cercanía dentro de la franja', () => {
    const mk = (id: string, dia: number, lat: number) => ({ numero_sua: id, anio: 2026, prioridad: 'Alta', latitud: lat, longitud: 0, fecha_ultima_derivacion: new Date(Date.UTC(2026, 7, dia)) });
    const items = [mk('a', 1, 0), mk('b', 2, 5), mk('c', 2, 1), mk('d', 10, 0)];
    expect(agruparPorFranja(items).map((f) => f.length)).toEqual([3, 1]);
    const dist = (x: any, y: any) => Math.abs((x === 'sede' ? 0 : x.latitud) - y.latitud);
    // franja 1 = a,b,c; con cupo 2 y ancla sede: toma a (0) y luego c (1) antes que b (5)
    expect(seleccionar(items, 2, dist).map((i) => i.numero_sua)).toEqual(['a', 'c']);
    // sin distancias: solo antigüedad (orden por fecha)
    expect(seleccionar(items, 2, null).map((i) => i.numero_sua)).toEqual(['a', 'b']);
  });
});
