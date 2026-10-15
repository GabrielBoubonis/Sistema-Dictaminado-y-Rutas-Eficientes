import fs from 'fs';
import path from 'path';
import { api, auth, prepararBase, prisma, providers, randomUUID, token } from './helpers';
import { MockReclamoProvider } from '../src/providers';
import { SoftAuthenticator } from './soft-authenticator';
import { calcularHash, reintentarEnviosSua } from '../src/services/registro-dictamen';
import { dictamenSchema } from '../src/services/dictamenes';

import { catalogos } from '../src/catalogos';
const MOTIVO = catalogos.motivo_extraccion[0];
const SIN_TRABAJO = catalogos.motivo_sin_trabajo[0];
const FOTO = fs.readFileSync(path.join(__dirname, '../../../datos-prueba/fotos/foto-prueba-1.jpg')).toString('base64');
const sua = () => providers.reclamo as MockReclamoProvider;
const autenticadores = new Map<string, SoftAuthenticator>();

beforeEach(async () => { await prepararBase(); autenticadores.clear(); sua().caido = false; });
afterAll(() => prisma.$disconnect());

async function registrarHuella(usuario: string, t: string) {
  const a = new SoftAuthenticator();
  const o = await api().post('/api/auth/webauthn/registro/opciones').set(auth(t));
  expect(o.status).toBe(200);
  const v = await api().post('/api/auth/webauthn/registro/verificar').set(auth(t)).send(a.registrar(o.body.challenge));
  if (v.status !== 200) console.log(JSON.stringify(v.body));
  expect(v.status).toBe(200);
  autenticadores.set(usuario, a);
  return a;
}

async function pendiente(skip = 0) {
  return (await prisma.solicitud.findMany({ where: { estado: 'Pendiente', es_tormenta: false, latitud: { not: null } }, orderBy: [{ numero_sua: 'asc' }], skip, take: 1 }))[0];
}

/** Arma un dictamen válido tal como lo haría el cliente (incluye hash de firma). */
function armar(usuario: string, s: { numero_sua: string; anio: number }, cambios: Record<string, any> = {}) {
  const base: any = {
    uuid_dictamen: randomUUID(), fecha_firma: new Date().toISOString(), numero_sua: s.numero_sua, anio: s.anio,
    nota_numero: 1500, expediente_numero: 30777, fecha_emision: new Date().toISOString().slice(0, 10),
    domicilio_ejemplar: 'Pellegrini 1500', latitud_ejemplar: -32.95, longitud_ejemplar: -60.65, id_especie: 1,
    distancia_medianera_referencia: 1.2, cantidad_frente: 2, nivel_dano_vereda: 'Medio',
    es_extraccion: false, es_sin_trabajo: false, trabajos_aereos: ['Liberación de conductores eléctricos'],
    trabajos_subterraneos: [{ tipo_trabajo: 'Corte vertical de raíces', distancia_borde: 0.8 }],
    complejidad: 'Media', urgente: false, arbol_frente_garage: false, media_tension: false, de_oficio: false,
    plantar: 'Cazuela', nivel_prioridad: 'Media', observaciones: 'Prueba', fotos: [{ contenido_base64: FOTO }], ...cambios,
  };
  const parsed = dictamenSchema.parse({ ...base, hash_firma: undefined });
  base.hash_firma = calcularHash(parsed, usuario).hash;
  return base;
}

const firmar = (usuario: string, d: any, opciones = {}) => ({ ...d, segundo_factor: autenticadores.get(usuario)!.firmar(d.hash_firma, opciones) });
const enviar = (t: string, cuerpo: any) => api().post('/api/dictamenes').set(auth(t)).send(cuerpo);

describe('Firma de dictámenes (RF-20 a RF-26, RF-45, RF-46, RF-51, RF-61)', () => {
  it('flujo completo: firma con segundo factor, estado Dictaminada, libera la reserva, envía al SUA y genera PDF', async () => {
    const t = await token('mrossi0'); await registrarHuella('mrossi0', t);
    const rutaR = await api().post('/api/rutas').set(auth(t)).send({ modo: 'Caminando', cantidades: { Alta: 2 } });
    const s = rutaR.body.solicitudes[0];
    const d = armar('mrossi0', s);
    const r = await enviar(t, firmar('mrossi0', d));
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ estado_solicitud: 'Dictaminada', vigente: true, hash_firma: d.hash_firma, enviado_sua: true });

    const ruta = await api().get('/api/rutas/activa').set(auth(t));
    expect(ruta.body.solicitudes.find((x: any) => x.numero_sua === s.numero_sua).liberada).toBe(true); // RF-17

    // RF-24: el SUA recibe lo cargado (campos, autor, fecha, fotos) y no los datos internos
    const enSua = await prisma.suaDatosComplementarios.findUniqueOrThrow({ where: { numero_sua_anio: { numero_sua: s.numero_sua, anio: s.anio } } });
    const payload: any = enSua.payload;
    expect(payload).toMatchObject({ autor: 'mrossi0', nivel_dano_vereda: 'Medio', complejidad: 'Media' });
    expect(payload.fotografias[0].contenido_base64).toBe(FOTO);
    expect(JSON.stringify(payload)).not.toContain(d.hash_firma);
    expect(payload).not.toHaveProperty('estado_sincronizacion');

    const pdf = await api().get(`/api/dictamenes/${r.body.id_dictamen}/pdf`).set(auth(t)).buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on('data', (x: Buffer) => c.push(x)); res.on('end', () => cb(null, Buffer.concat(c))); });
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');

    const foto = await api().get(`/api/dictamenes/${r.body.id_dictamen}/fotos/1`).set(auth(t));
    expect(foto.status).toBe(200);
    expect(foto.headers['content-type']).toContain('image/jpeg');

    const sol = await api().get(`/api/solicitudes/${s.numero_sua}/${s.anio}`).set(auth(t));
    expect(sol.body.estado).toBe('Dictaminada');
  });

  it('RF-45: exige al menos una fotografía', async () => {
    const t = await token('mrossi0'); await registrarHuella('mrossi0', t);
    const s = await pendiente();
    const d = armar('mrossi0', s); d.fotos = [];
    expect((await enviar(t, firmar('mrossi0', d))).status).toBe(422);
  });

  it('RF-46 / RF-61: reglas de Extracción y Sin trabajo', async () => {
    const t = await token('mrossi0'); await registrarHuella('mrossi0', t);
    const s = await pendiente();
    const casos: Array<[string, Record<string, any>]> = [
      ['extracción con trabajos', { es_extraccion: true, motivo_extraccion: MOTIVO, perimetro_tronco: 1.1 }],
      ['extracción sin motivo', { es_extraccion: true, trabajos_aereos: [], trabajos_subterraneos: [] }],
      ['sin trabajo con trabajos', { es_sin_trabajo: true, motivo_sin_trabajo: SIN_TRABAJO }],
      ['sin trabajo + extracción', { es_sin_trabajo: true, es_extraccion: true, motivo_sin_trabajo: SIN_TRABAJO, motivo_extraccion: MOTIVO, trabajos_aereos: [], trabajos_subterraneos: [] }],
      ['ninguna intervención', { trabajos_aereos: [], trabajos_subterraneos: [] }],
      ['corte vertical sin distancia', { trabajos_aereos: [], trabajos_subterraneos: [{ tipo_trabajo: 'Corte vertical de raíces' }] }],
    ];
    for (const [nombre, cambios] of casos) {
      const d = armar('mrossi0', s, cambios);
      const r = await enviar(t, firmar('mrossi0', d)).catch((e) => e);
      expect([nombre, r.status]).toEqual([nombre, 422]);
    }
  });

  it('RF-56: valores fuera de las listas cerradas o números no enteros se rechazan', async () => {
    const t = await token('mrossi0'); await registrarHuella('mrossi0', t);
    const s = await pendiente();
    for (const cambios of [{ nivel_dano_vereda: 'Gigante' }, { complejidad: 'Extrema' }, { nota_numero: 12.5 }, { nota_numero: -3 }, { plantar: 'Palmera' }, { trabajos_aereos: ['Pintar el tronco'] }]) {
      const d = armar('mrossi0', s, {});
      Object.assign(d, cambios);
      expect((await enviar(t, { ...d, segundo_factor: autenticadores.get('mrossi0')!.firmar(d.hash_firma) })).status).toBe(422);
    }
  });

  it('un Lector no puede dictaminar; Operador sin biometría recibe 403', async () => {
    const tl = await token('tmolina0');
    const s = await pendiente();
    expect((await enviar(tl, armar('tmolina0', s))).status).toBe(403);
    const t = await token('mrossi0'); await registrarHuella('mrossi0', t);
    const d = armar('mrossi0', s);
    const sinFactor = await enviar(t, d);
    expect(sinFactor.status).toBe(403);
    expect(sinFactor.body.error).toBe('segundo_factor_requerido');
  });

  it('RF-51: la aserción debe corresponder a ESTE contenido y a una credencial del mismo usuario', async () => {
    const t = await token('mrossi0'); const a = await registrarHuella('mrossi0', t);
    const t2 = await token('pgimene0'); const b = await registrarHuella('pgimene0', t2);
    const s = await pendiente();
    const d = armar('mrossi0', s);
    const otroHash = 'a'.repeat(64);
    const r1 = await enviar(t, { ...d, segundo_factor: a.firmar(d.hash_firma, { desafioDistinto: otroHash }) });
    expect(r1.status).toBe(403); expect(r1.body.error).toBe('segundo_factor_invalido');
    const r2 = await enviar(t, { ...d, segundo_factor: b.firmar(d.hash_firma) });
    expect(r2.status).toBe(403);
    expect(await prisma.dictamen.count({ where: { uuid_dictamen: d.uuid_dictamen } })).toBe(0);
    expect((await enviar(t, { ...d, segundo_factor: a.firmar(d.hash_firma) })).status).toBe(201); // los datos quedan intactos para reintentar
  });

  it('RF-22: si el contenido no coincide con el hash declarado, se rechaza', async () => {
    const t = await token('mrossi0'); await registrarHuella('mrossi0', t);
    const s = await pendiente();
    const d = armar('mrossi0', s);
    d.observaciones = 'Contenido alterado después de calcular el hash';
    const r = await enviar(t, firmar('mrossi0', d));
    expect(r.status).toBe(422); expect(r.body.error).toBe('hash_no_coincide');
  });

  it('rechaza archivos que no son imágenes', async () => {
    const t = await token('mrossi0'); await registrarHuella('mrossi0', t);
    const s = await pendiente();
    const d = armar('mrossi0', s, { fotos: [{ contenido_base64: Buffer.from('esto no es una imagen, es texto').toString('base64') }] });
    expect((await enviar(t, firmar('mrossi0', d))).body.error).toBe('foto_invalida');
  });

  it('RF-21: dos envíos simultáneos para el mismo caso → se acepta el primero y se rechaza el segundo', async () => {
    const t1 = await token('mrossi0'); await registrarHuella('mrossi0', t1);
    const t2 = await token('pgimene0'); await registrarHuella('pgimene0', t2);
    const s = await pendiente();
    const [a, b] = await Promise.all([
      enviar(t1, firmar('mrossi0', armar('mrossi0', s))),
      enviar(t2, firmar('pgimene0', armar('pgimene0', s))),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(await prisma.dictamen.count({ where: { numero_sua: s.numero_sua, anio: s.anio, vigente: true } })).toBe(1);
  });

  it('idempotencia por UUID: reenviar no duplica', async () => {
    const t = await token('mrossi0'); await registrarHuella('mrossi0', t);
    const s = await pendiente();
    const cuerpo = firmar('mrossi0', armar('mrossi0', s));
    expect((await enviar(t, cuerpo)).status).toBe(201);
    const r = await enviar(t, cuerpo);
    expect(r.status).toBe(200); expect(r.body.duplicado).toBe(true);
    expect(await prisma.dictamen.count({ where: { uuid_dictamen: cuerpo.uuid_dictamen } })).toBe(1);
  });

  it('RF-12 / RF-27: una solicitud re-derivada se vuelve a dictaminar; el anterior queda en el historial como no vigente', async () => {
    const t = await token('cbenite0'); await registrarHuella('cbenite0', t);
    const rev = await prisma.solicitud.findFirstOrThrow({ where: { estado: 'Pendiente-revisión', latitud: { not: null }, dictamenes: { none: { vigente: null } } }, include: { dictamenes: true } });
    const r = await enviar(t, firmar('cbenite0', armar('cbenite0', rev, { fecha_emision: new Date().toISOString().slice(0, 10) })));
    expect(r.status).toBe(201);
    expect(r.body.estado_solicitud).toBe('Dictaminada');
    const h = await api().get(`/api/dictamenes/${rev.numero_sua}/${rev.anio}/historial`).set(auth(t));
    expect(h.body.length).toBe(rev.dictamenes.length + 1);
    expect(h.body.filter((d: any) => d.vigente === true)).toHaveLength(1);
    expect(h.body.filter((d: any) => d.vigente === false).length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(h.body)).not.toContain('contenido_base64');
  });

  it('RF-25 / RNF-17: si el SUA no responde, queda pendiente y se reintenta con espera creciente', async () => {
    const t = await token('mrossi0'); await registrarHuella('mrossi0', t);
    const s = await pendiente();
    sua().caido = true;
    const r = await enviar(t, firmar('mrossi0', armar('mrossi0', s)));
    expect(r.status).toBe(201); expect(r.body.enviado_sua).toBe(false);
    let d = await prisma.dictamen.findUniqueOrThrow({ where: { id_dictamen: r.body.id_dictamen } });
    expect(d).toMatchObject({ estado_sincronizacion: 'pendiente_sua', sua_intentos: 1 });
    expect(await reintentarEnviosSua()).toBe(0); // todavía no toca
    expect(await reintentarEnviosSua(new Date(Date.now() + 61 * 60 * 1000))).toBe(0); // SUA sigue caído
    d = await prisma.dictamen.findUniqueOrThrow({ where: { id_dictamen: r.body.id_dictamen } });
    expect(d.sua_intentos).toBe(2);
    expect(d.sua_proximo_intento!.getTime() - Date.now()).toBeGreaterThan(90 * 1000); // espera creciente
    sua().caido = false;
    expect(await reintentarEnviosSua(new Date(Date.now() + 3 * 3600 * 1000))).toBe(1);
    expect((await prisma.dictamen.findUniqueOrThrow({ where: { id_dictamen: r.body.id_dictamen } })).estado_sincronizacion).toBe('enviado_sua');
  });
});

describe('Sincronización offline (RF-31 a RF-33, RF-53, RF-59)', () => {
  const sync = (t: string, items: any[]) => api().post('/api/sync/dictamenes').set(auth(t)).send({ dictamenes: items });

  it('sincroniza la cola; reenviar es idempotente', async () => {
    const t = await token('mrossi0'); await registrarHuella('mrossi0', t);
    const [s1, s2] = [await pendiente(0), await pendiente(1)];
    const items = [s1, s2].map((s) => firmar('mrossi0', armar('mrossi0', s, { firmado_sin_conexion: true }))).map((d) => ({ dictamen: (({ segundo_factor, ...r }) => r)(d), segundo_factor: d.segundo_factor }));
    const r = await sync(t, items);
    expect(r.body.resultados.map((x: any) => x.estado)).toEqual(['sincronizado', 'sincronizado']);
    const r2 = await sync(t, items);
    expect(r2.body.resultados.map((x: any) => x.estado)).toEqual(['duplicado', 'duplicado']);
    const d = await prisma.dictamen.findFirstOrThrow({ where: { uuid_dictamen: items[0].dictamen.uuid_dictamen } });
    expect(d.firmado_sin_conexion).toBe(true);
  });

  it('RF-53: contenido alterado → rechazado, queda "Integridad no verificada" en Para revisar y no cambia la solicitud', async () => {
    const t = await token('mrossi0'); await registrarHuella('mrossi0', t);
    const s = await pendiente();
    const d = armar('mrossi0', s);
    const segundo_factor = autenticadores.get('mrossi0')!.firmar(d.hash_firma);
    const alterado = { ...d, observaciones: 'Alterado en el dispositivo' };
    for (let i = 0; i < 2; i++) { // el reintento devuelve lo mismo
      const r = await sync(t, [{ dictamen: alterado, segundo_factor }]);
      expect(r.body.resultados[0]).toMatchObject({ estado: 'rechazado', error: 'integridad_no_verificada' });
    }
    const guardado = await prisma.dictamen.findFirstOrThrow({ where: { uuid_dictamen: d.uuid_dictamen } });
    expect(guardado).toMatchObject({ vigente: false, estado_sincronizacion: 'integridad_no_verificada' });
    expect(await prisma.casoRevision.count({ where: { tipo: 'Integridad no verificada', id_dictamen: guardado.id_dictamen } })).toBe(1);
    expect((await prisma.solicitud.findUniqueOrThrow({ where: { numero_sua_anio: { numero_sua: s.numero_sua, anio: s.anio } } })).estado).toBe('Pendiente');
    const admin = await token('asuarez0');
    const rev = await api().get('/api/revision').set(auth(admin));
    expect(rev.body.some((c: any) => c.tipo === 'Integridad no verificada' && c.id_dictamen === guardado.id_dictamen)).toBe(true);
  });

  it('RF-59: dos dictámenes firmados para el mismo caso → Pendiente-revisión y el Jefe elige cuál queda vigente', async () => {
    const tA = await token('mrossi0'); await registrarHuella('mrossi0', tA);
    const tB = await token('cbenite0'); await registrarHuella('cbenite0', tB);
    const s = await pendiente();
    expect((await enviar(tA, firmar('mrossi0', armar('mrossi0', s)))).status).toBe(201); // en línea
    const offline = firmar('cbenite0', armar('cbenite0', s, { firmado_sin_conexion: true, observaciones: 'Versión offline' }));
    const r = await sync(tB, [{ dictamen: (({ segundo_factor, ...x }) => x)(offline), segundo_factor: offline.segundo_factor }]);
    expect(r.body.resultados[0]).toMatchObject({ estado: 'sincronizado', conflicto: true, estado_solicitud: 'Pendiente-revisión', vigente: null });

    const sol = await prisma.solicitud.findUniqueOrThrow({ where: { numero_sua_anio: { numero_sua: s.numero_sua, anio: s.anio } } });
    expect(sol.estado).toBe('Pendiente-revisión');
    // tampoco se puede dictaminar en línea mientras haya conflicto
    expect((await enviar(tA, firmar('mrossi0', armar('mrossi0', s)))).status).toBe(409);

    const jefe = await token('pgimene0');
    const c = await api().get(`/api/dictamenes/${s.numero_sua}/${s.anio}/conflicto`).set(auth(jefe));
    expect(c.body.hay_conflicto).toBe(true);
    expect(c.body.dictamenes).toHaveLength(2);
    expect((await api().get(`/api/dictamenes/${s.numero_sua}/${s.anio}/conflicto`).set(auth(tA))).status).toBe(403);

    const elegido = c.body.dictamenes.find((d: any) => d.nombre_usuario === 'cbenite0');
    expect((await api().post(`/api/dictamenes/${elegido.id_dictamen}/vigente`).set(auth(tA)).send({})).status).toBe(403);
    const ok = await api().post(`/api/dictamenes/${elegido.id_dictamen}/vigente`).set(auth(jefe)).send({});
    expect(ok.body.estado_solicitud).toBe('Dictaminada');
    const h = await api().get(`/api/dictamenes/${s.numero_sua}/${s.anio}/historial`).set(auth(jefe));
    expect(h.body.filter((d: any) => d.vigente === true).map((d: any) => d.nombre_usuario)).toEqual(['cbenite0']);
    expect(h.body.filter((d: any) => d.vigente === false)).toHaveLength(1);
    const aud = await prisma.registroAuditoria.findFirstOrThrow({ where: { accion: 'Elección de dictamen vigente' } });
    expect(aud).toMatchObject({ nombre_usuario: 'pgimene0', entidad_afectada: `solicitud ${s.numero_sua}-${s.anio}` });
    expect((await api().post(`/api/dictamenes/${elegido.id_dictamen}/vigente`).set(auth(jefe)).send({})).status).toBe(409);
  });
});

describe('Especies (RF-56)', () => {
  it('busca sin tildes ni mayúsculas, agrega sin duplicar y registra quién la agregó', async () => {
    const t = await token('mrossi0');
    const todas = await api().get('/api/especies').set(auth(t));
    expect(todas.body.length).toBeGreaterThan(10);
    const ejemplo = todas.body.find((e: any) => /[áéíóú]/i.test(e.nombre_comun));
    if (ejemplo) {
      const sinTilde = ejemplo.nombre_comun.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
      const r = await api().get(`/api/especies?q=${encodeURIComponent(sinTilde)}`).set(auth(t));
      expect(r.body.some((e: any) => e.id_especie === ejemplo.id_especie)).toBe(true);
    }
    const n1 = await api().post('/api/especies').set(auth(t)).send({ nombre_comun: 'jacarandá blanco', nombre_cientifico: 'Jacaranda mimosifolia alba' });
    expect(n1.status).toBe(201);
    expect(n1.body.creada_por).toBe('mrossi0');
    const n2 = await api().post('/api/especies').set(auth(await token('pgimene0'))).send({ nombre_comun: 'JACARANDA   Blanco' });
    expect(n2.status).toBe(200); expect(n2.body).toMatchObject({ existente: true, id_especie: n1.body.id_especie });
    expect((await api().post('/api/especies').set(auth(t)).send({ nombre_comun: '<script>' })).status).toBe(422);
    expect((await api().post('/api/especies').set(auth(await token('tmolina0'))).send({ nombre_comun: 'Algo' })).status).toBe(403);
  });
});
