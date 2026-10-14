import { api, auth, login, prepararBase, prisma, providers, randomUUID, throttle, token, PASS } from './helpers';
import { MockAuthProvider } from '../src/providers';

beforeAll(prepararBase);
beforeEach(() => { throttle.reset(); (providers.auth as MockAuthProvider).caido = false; });
afterAll(() => prisma.$disconnect());

describe('Login (RF-01 a RF-03, RF-50)', () => {
  it('ingresa con credenciales válidas y devuelve tokens y rol', async () => {
    const r = await login('mrossi');
    expect(r.status).toBe(200);
    expect(r.body.accessToken).toBeTruthy();
    expect(r.body.refreshToken).toContain('.');
    expect(r.body.usuario).toMatchObject({ nombre_usuario: 'mrossi', rol: 'Operador' });
  });

  it('RF-50: mismo mensaje y mismo status para contraseña incorrecta, usuario inexistente, no vigente y sin cuenta local', async () => {
    const casos = [
      await login('mrossi', 'Incorrecta1!'),
      await login('noexiste', PASS),
      await login('jdiaz', PASS),   // existe local pero no vigente en la Autenticación Institucional
      await login('nmedina', PASS), // vigente en la institución pero sin cuenta local
    ];
    for (const r of casos) expect(r.status).toBe(401);
    const mensajes = new Set(casos.map((r) => JSON.stringify(r.body)));
    expect(mensajes.size).toBe(1);
    expect(casos[0].body.mensaje).toBe('Usuario o contraseña incorrectos');
  });

  it('CU-01 E1: si la Autenticación Institucional cae, informa con otro mensaje y no cuenta como intento', async () => {
    (providers.auth as MockAuthProvider).caido = true;
    for (let i = 0; i < 12; i++) {
      const r = await login('mrossi');
      expect(r.status).toBe(503);
      expect(r.body.error).toBe('autenticacion_no_disponible');
      expect(r.body.mensaje).not.toBe('Usuario o contraseña incorrectos');
    }
    (providers.auth as MockAuthProvider).caido = false;
    expect((await login('mrossi')).status).toBe(200); // 12 caídas no bloquearon (RNF-19)
  });

  it('RNF-19: 10 intentos fallidos bloquean el siguiente, aunque la contraseña sea correcta, y vale también para usuarios inexistentes', async () => {
    for (let i = 0; i < 10; i++) expect((await login('cbenite', 'mala')).status).toBe(401);
    const bloqueado = await login('cbenite', PASS);
    expect(bloqueado.status).toBe(429);
    expect(bloqueado.body.reintentarEnSegundos).toBeGreaterThan(0);
    for (let i = 0; i < 10; i++) await login('fantasma', 'mala');
    expect((await login('fantasma', 'mala')).status).toBe(429);
    // otro usuario no se ve afectado
    expect((await login('lfernan')).status).toBe(200);
  });

  it('RNF-19: la espera crece entre bloqueos sucesivos', () => {
    const t = throttle; t.reset();
    const w = Number(process.env.LOGIN_WINDOW_MS ?? 15 * 60 * 1000);
    let ahora = 1_000_000;
    for (let i = 0; i < 10; i++) t.registrarFallo('ip', 'x', ahora);
    const primera = t.restante('ip', 'x', ahora);
    ahora += primera * 1000 + 1;
    for (let i = 0; i < 10; i++) t.registrarFallo('ip', 'x', ahora);
    const segunda = t.restante('ip', 'x', ahora);
    expect(segunda).toBe(primera * 2);
    expect(primera).toBe(w / 1000);
  });
});

describe('Sesión (RF-04, RF-05, RNF-20)', () => {
  it('refresh rota el token: el anterior deja de servir', async () => {
    const l = await login('mrossi');
    const r1 = await api().post('/api/auth/refresh').send({ refreshToken: l.body.refreshToken });
    expect(r1.status).toBe(200);
    expect(r1.body.refreshToken).not.toBe(l.body.refreshToken);
    expect((await api().post('/api/auth/refresh').send({ refreshToken: l.body.refreshToken })).status).toBe(401);
    expect((await api().get('/api/auth/me').set(auth(r1.body.accessToken))).body.nombre_usuario).toBe('mrossi');
  });

  it('RNF-20: pasados 7 días desde el primer ingreso no se puede renovar aunque haya actividad', async () => {
    const l = await login('mrossi');
    const id = l.body.refreshToken.split('.')[0];
    await prisma.refreshToken.update({ where: { id }, data: { cadena_inicio: new Date(Date.now() - 8 * 24 * 3600 * 1000) } });
    const r = await api().post('/api/auth/refresh').send({ refreshToken: l.body.refreshToken });
    expect(r.status).toBe(401);
    expect(r.body.error).toBe('sesion_vencida');
  });

  it('RF-04: un refresh token inactivo por más de 30 minutos vence', async () => {
    const l = await login('mrossi');
    const id = l.body.refreshToken.split('.')[0];
    await prisma.refreshToken.update({ where: { id }, data: { expira: new Date(Date.now() - 1000) } });
    expect((await api().post('/api/auth/refresh').send({ refreshToken: l.body.refreshToken })).status).toBe(401);
  });

  it('rutas protegidas exigen token válido', async () => {
    expect((await api().get('/api/auth/me')).status).toBe(401);
    expect((await api().get('/api/auth/me').set(auth('basura'))).status).toBe(401);
  });

  it('cabeceras de seguridad (RNF-21)', async () => {
    const r = await api().get('/api/health');
    expect(r.headers['content-security-policy']).toContain("default-src 'self'");
    expect(r.headers['strict-transport-security']).toBeTruthy();
    expect(r.headers['x-frame-options']).toBe('DENY');
  });

  it('RF-57: revalidar con usuario no vigente cierra las sesiones', async () => {
    const t = await token('lfernan');
    await prisma.usuarioInstitucional.update({ where: { nombre_usuario: 'lfernan' }, data: { vigente: false } });
    expect((await api().post('/api/auth/revalidar').set(auth(t))).status).toBe(401);
    await prisma.usuarioInstitucional.update({ where: { nombre_usuario: 'lfernan' }, data: { vigente: true } });
  });
});

describe('Captor: bloqueo, desbloqueo y revocación (RF-52, RF-60, CU-16)', () => {
  it('flujo completo: bloqueo local → código → desbloqueo del Administrador → auditoría', async () => {
    const did = randomUUID();
    expect((await login('mrossi', PASS, did)).status).toBe(200);
    const b = await api().post('/api/auth/dispositivo/bloqueo').send({ dispositivoId: did, usuario: 'mrossi' });
    expect(b.body.estado).toBe('Bloqueado');
    const codigo = b.body.codigo as string;
    expect(codigo).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);

    const l = await login('mrossi', PASS, did);
    expect(l.status).toBe(423);
    expect(l.body.codigo).toBe(codigo);

    const admin = await token('asuarez');
    const lista = await api().get(`/api/usuarios/captores-bloqueados?codigo=${codigo.toLowerCase()}`).set(auth(admin));
    expect(lista.body).toHaveLength(1);
    expect(lista.body[0]).toMatchObject({ codigo, usuario: 'mrossi', estado: 'Bloqueado' });

    expect((await api().post(`/api/usuarios/captores/${codigo}/desbloquear`).set(auth(admin))).status).toBe(200);
    expect((await login('mrossi', PASS, did)).status).toBe(200);
    const aud = await prisma.registroAuditoria.findFirst({ where: { accion: 'Desbloqueo de captor' }, orderBy: { id_auditoria: 'desc' } });
    expect(aud).toMatchObject({ nombre_usuario: 'asuarez', entidad_afectada: `captor ${codigo}` });
  });

  it('CU-16 E1/E2: código inexistente → 404; captor revocado → 409', async () => {
    const admin = await token('asuarez');
    expect((await api().post('/api/usuarios/captores/ZZZZ-ZZZZ/desbloquear').set(auth(admin))).status).toBe(404);
    // R3TB-44LN ya viene Revocado en los datos de prueba
    expect((await api().post('/api/usuarios/captores/R3TB-44LN/desbloquear').set(auth(admin))).status).toBe(409);
  });

  it('revocar el captor invalida la sesión activa de inmediato (RF-52)', async () => {
    const did = randomUUID();
    const l = await login('lfernan', PASS, did);
    const t = l.body.accessToken as string;
    expect((await api().get('/api/auth/me').set(auth(t))).status).toBe(200);
    const admin = await token('asuarez');
    expect((await api().post('/api/usuarios/lfernan/revocar-captor').set(auth(admin)).send({})).status).toBe(200);
    const r = await api().get('/api/auth/me').set(auth(t));
    expect(r.status).toBe(401);
    expect(r.body.error).toBe('sesion_finalizada');
    expect((await api().post('/api/auth/refresh').send({ refreshToken: l.body.refreshToken })).status).toBe(401);
    expect((await login('lfernan', PASS, did)).status).toBe(403);
  });

  it('solo el Administrador puede desbloquear', async () => {
    const t = await token('pgimene');
    expect((await api().post('/api/usuarios/captores/K7M2-X9QD/desbloquear').set(auth(t))).status).toBe(403);
  });
});

describe('Gestión de usuarios (RF-06 a RF-08, RF-54)', () => {
  it('alta con nombre de usuario autogenerado (inicial + apellido + número si se repite) y auditoría', async () => {
    const admin = await token('asuarez');
    const r = await api().post('/api/usuarios').set(auth(admin)).send({ nombre: 'Mario', apellido: 'Rossi', password: 'Nueva2026!', rol: 'Lector' });
    expect(r.status).toBe(201);
    expect(r.body.nombre_usuario).toBe('mrossi1');
    expect(r.body).not.toHaveProperty('contrasena_hash');
    const aud = await prisma.registroAuditoria.findFirst({ where: { accion: 'Alta de usuario', entidad_afectada: 'mrossi1' } });
    expect(aud?.nombre_usuario).toBe('asuarez');
  });

  it('rechaza contraseñas que no cumplen la complejidad (RNF-05)', async () => {
    const admin = await token('asuarez');
    const r = await api().post('/api/usuarios').set(auth(admin)).send({ nombre: 'Ana', apellido: 'Perez', password: 'corta', rol: 'Lector' });
    expect(r.status).toBe(422);
    expect(r.body.error).toBe('contrasena_debil');
  });

  it('un Operador no puede gestionar usuarios', async () => {
    const t = await token('mrossi');
    expect((await api().get('/api/usuarios').set(auth(t))).status).toBe(403);
  });

  it('cambio de rol y baja quedan auditados; la baja corta la sesión activa (CU-02 E3)', async () => {
    const admin = await token('asuarez');
    const tl = await token('tmolina');
    expect((await api().patch('/api/usuarios/tmolina').set(auth(admin)).send({ rol: 'Operador' })).status).toBe(200);
    expect((await prisma.registroAuditoria.findFirst({ where: { accion: 'Cambio de rol', entidad_afectada: 'tmolina' } }))?.valor_nuevo).toBe('Operador');
    expect((await api().patch('/api/usuarios/tmolina').set(auth(admin)).send({ activo: false })).status).toBe(200);
    expect((await api().get('/api/auth/me').set(auth(tl))).status).toBe(401);
    expect((await login('tmolina')).status).toBe(401);
  });

  it('no puede quitarse el rol ni darse de baja a sí mismo', async () => {
    const admin = await token('asuarez');
    expect((await api().patch('/api/usuarios/asuarez').set(auth(admin)).send({ activo: false })).status).toBe(409);
  });

  it('restablecer contraseña deja sin efecto la anterior (CU-02 E2)', async () => {
    const admin = await token('asuarez');
    const r = await api().post('/api/usuarios/lfernan/reset-password').set(auth(admin)).send({});
    expect(r.status).toBe(200);
    expect(r.body.passwordNueva).toBeTruthy();
    expect((await login('lfernan', PASS)).status).toBe(401);
    expect((await login('lfernan', r.body.passwordNueva)).status).toBe(200);
  });

  it('RF-54: el registro de auditoría es inmutable también a nivel de base de datos', async () => {
    await expect(prisma.$executeRawUnsafe(`UPDATE registro_auditoria SET accion = 'x'`)).rejects.toThrow(/inmutable/);
    await expect(prisma.$executeRawUnsafe(`DELETE FROM registro_auditoria`)).rejects.toThrow(/inmutable/);
  });
});
