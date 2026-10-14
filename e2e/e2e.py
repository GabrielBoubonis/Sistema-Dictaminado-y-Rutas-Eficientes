import json, os, subprocess, sys, time, urllib.request
from playwright.sync_api import sync_playwright, expect

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = os.environ.get('E2E_BASE', 'http://localhost:3000')
DB = os.environ.get('E2E_DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/arbolado')
FOTO = os.path.join(HERE, '..', '..', 'datos-prueba', 'fotos', 'foto_prueba_1.jpg')
PSQL = ['psql', DB, '-At', '-c']

def sql(q): return subprocess.run(PSQL + [q], capture_output=True, text=True).stdout.strip()
def api(path, body=None, token=None, method=None):
    req = urllib.request.Request(BASE + '/api' + path, data=json.dumps(body).encode() if body is not None else None,
        headers={'Content-Type': 'application/json', **({'Authorization': 'Bearer ' + token} if token else {})}, method=method)
    return json.loads(urllib.request.urlopen(req).read() or b'{}')

def reseed():
    env = {**os.environ, 'DATABASE_URL': DB, 'BCRYPT_COST': '4'}
    r = subprocess.run(['npx', 'tsx', 'src/seed.ts'], cwd=os.path.join(HERE, '..', 'backend'), env=env, capture_output=True, text=True)
    assert 'cargados' in r.stdout, r.stdout + r.stderr

def paso(m): print('•', m, flush=True)

def dictaminar(page, offline=False):
    """Recorre los 5 pasos del formulario con 'Sin trabajo' y firma."""
    page.get_by_role('link', name='Dictaminar').first.click()
    expect(page.get_by_role('status').filter(has_text='Paso 1 de 5')).to_be_visible()
    page.get_by_label('Especie *').fill('arce')
    page.get_by_role('option').first.click()
    page.get_by_role('button', name='Siguiente').click()
    expect(page.get_by_role('status').filter(has_text='Paso 2 de 5')).to_be_visible()
    page.get_by_label('Sin trabajo', exact=True).check()
    page.get_by_label('Motivo *').select_option(index=1)
    page.get_by_role('button', name='Siguiente').click()
    expect(page.get_by_role('status').filter(has_text='Paso 3 de 5')).to_be_visible()
    page.get_by_role('button', name='Siguiente').click()
    expect(page.get_by_role('status').filter(has_text='Paso 4 de 5')).to_be_visible()
    page.get_by_label('Complejidad de la intervención *').select_option('Baja')
    page.get_by_label('Agregar fotografías').set_input_files(FOTO)
    expect(page.get_by_alt_text('Fotografía 1')).to_be_visible()
    page.get_by_role('button', name='Siguiente').click()
    expect(page.get_by_role('status').filter(has_text='Paso 5 de 5')).to_be_visible()
    page.get_by_label('Nivel de prioridad de la intervención *').select_option('Media')
    page.get_by_label('Observaciones').fill('Prueba E2E ñandú áéíóú')
    page.get_by_role('button', name='Firmar dictamen').click()

reseed()
api('/dev/reset-throttle', {})
os.makedirs(os.path.join(HERE, 'capturas'), exist_ok=True)
with sync_playwright() as p:
    br = p.chromium.launch()
    ctx = br.new_context(viewport={'width': 390, 'height': 844}, base_url=BASE)
    page = ctx.new_page()
    errores = []
    page.on('pageerror', lambda e: errores.append(str(e)))
    page.on('console', lambda m: errores.append(m.text) if m.type == 'error' and ('Content Security Policy' in m.text or 'tile.openstreetmap' not in m.text) and 'ERR_' not in m.text and 'Failed to load resource' not in m.text else None)
    cdp = ctx.new_cdp_session(page)
    cdp.send('WebAuthn.enable')
    cdp.send('WebAuthn.addVirtualAuthenticator', {'options': {'protocol': 'ctap2', 'transport': 'internal', 'hasResidentKey': False,
        'hasUserVerification': True, 'isUserVerified': True, 'automaticPresenceSimulation': True}})

    paso('login con credenciales inválidas muestra el mensaje genérico y cuenta el intento')
    page.goto('/')
    page.get_by_label('Usuario', exact=True).fill('mrossi0'); page.get_by_label('Contraseña', exact=True).fill('mala')
    page.get_by_role('button', name='Ingresar').click()
    expect(page.get_by_role('alert')).to_contain_text('Usuario o contraseña incorrectos (intento 1 de 5)')

    paso('login correcto')
    page.get_by_label('Contraseña', exact=True).fill('Demo2026!')
    page.get_by_role('button', name='Ingresar').click()
    expect(page.get_by_role('heading', name='Solicitudes')).to_be_visible()
    expect(page.get_by_role('status').filter(has_text='Todo sincronizado')).to_be_visible()
    page.screenshot(path=os.path.join(HERE, 'capturas', '01-solicitudes.png'))

    paso('generar ruta (a pie, 3 de prioridad Alta)')
    page.get_by_role('link', name='Mi ruta').click()
    page.get_by_role('button', name='A pie').click()
    expect(page.get_by_text('(0 disponibles)')).to_have_count(0)
    page.get_by_label('Alta', exact=False).first.fill('3')
    page.get_by_role('button', name='Generar ruta').click()
    page.get_by_role('button', name='Confirmar').click()
    expect(page.get_by_role('heading', name='Mi ruta de hoy')).to_be_visible()
    expect(page.locator('article.card')).to_have_count(3)
    page.screenshot(path=os.path.join(HERE, 'capturas', '02-ruta.png'))

    paso('dictaminar #1 en línea: registro de huella + firma biométrica')
    dictaminar(page)
    expect(page.get_by_role('heading', name='Registrá tu huella')).to_be_visible()
    page.get_by_role('button', name='Registrar ahora').click()
    expect(page.get_by_role('heading', name='Registrá tu huella')).to_be_hidden(timeout=15000)
    page.get_by_role('button', name='Firmar dictamen').click()
    expect(page.get_by_text('Dictamen firmado y enviado al SUA')).to_be_visible(timeout=20000)
    page.screenshot(path=os.path.join(HERE, 'capturas', '03-firmado.png'))
    assert sql("select count(*) from dictamen where observaciones like 'Prueba E2E%' and vigente and estado_sincronizacion='enviado_sua'") == '1', 'dictamen online no quedó enviado'
    assert sql("select count(*) from sua_datos_complementarios where payload::text like '%Prueba E2E%'") == '1'
    expect(page.locator('article.card').filter(has_text='✓')).to_have_count(1)

    paso('dictaminar #2 SIN conexión: queda firmado y cifrado en el captor')
    ctx.set_offline(True)
    expect(page.get_by_role('status').filter(has_text='SIN SEÑAL')).to_be_visible(timeout=10000)
    dictaminar(page, offline=True)
    expect(page.get_by_text('Sin señal: el dictamen quedó firmado y guardado en el captor')).to_be_visible(timeout=20000)
    expect(page.get_by_role('status').filter(has_text='1 pendiente')).to_be_visible()
    cola = page.evaluate("""async () => new Promise((res) => { const r = indexedDB.open('dictaminado'); r.onsuccess = () => {
        const t = r.result.transaction('cola').objectStore('cola').getAll(); t.onsuccess = () => res(t.result.map(x => ({ uuid: x.uuid, claro: new TextDecoder().decode(x.datos).includes('Prueba E2E') }))); }; })""")
    assert len(cola) == 1 and cola[0]['claro'] is False, f'la cola no está cifrada: {cola}'
    assert sql("select count(*) from dictamen where observaciones like 'Prueba E2E%'") == '1', 'el dictamen offline no debería estar en el servidor aún'
    page.screenshot(path=os.path.join(HERE, 'capturas', '04-offline.png'))

    paso('volver la conexión: sincroniza solo')
    ctx.set_offline(False)
    expect(page.get_by_role('status').filter(has_text='Todo sincronizado')).to_be_visible(timeout=30000)
    assert sql("select count(*) from dictamen where observaciones like 'Prueba E2E%' and firmado_sin_conexion and vigente") == '1', 'el dictamen offline no llegó'
    n = page.evaluate("async () => new Promise((res) => { const r = indexedDB.open('dictaminado'); r.onsuccess = () => { const t = r.result.transaction('cola').objectStore('cola').count(); t.onsuccess = () => res(t.result); }; })")
    assert n == 0, 'la cola local no se vació tras confirmar'

    paso('reanudar sin señal tras cerrar sesión por inactividad (simulado: logout local)')
    page.get_by_role('button', name='Salir').click()
    ctx.set_offline(True)
    page.get_by_label('Usuario', exact=True).fill('mrossi0'); page.get_by_label('Contraseña', exact=True).fill('Demo2026!')
    page.get_by_role('button', name='Reanudar sin señal').click()
    expect(page.get_by_text('Reanudaste la sesión sin señal')).to_be_visible(timeout=10000)
    ctx.set_offline(False)
    expect(page.get_by_text('Reanudaste la sesión sin señal')).to_be_hidden(timeout=20000)  # revalidó contra el servidor

    paso('5 contraseñas incorrectas bloquean el captor; el Administrador lo desbloquea con el código')
    page.get_by_role('button', name='Salir').click()
    for i in range(5):
        page.get_by_label('Usuario', exact=True).fill('lfernan0'); page.get_by_label('Contraseña', exact=True).fill('incorrecta')
        page.get_by_role('button', name='Ingresar').click()
        if i < 4: expect(page.get_by_role('alert')).to_contain_text(f'intento {i+1} de 5')
    expect(page.get_by_role('heading', name='Captor bloqueado')).to_be_visible(timeout=10000)
    codigo = page.locator('.codigo').inner_text()
    paso(f'   código mostrado: {codigo}')
    admin = api('/auth/login', {'usuario': 'asuarez0', 'password': 'Demo2026!'})['accessToken']
    lista = api(f'/usuarios/captores-bloqueados?codigo={codigo}', token=admin)
    assert lista and lista[0]['estado'] == 'Bloqueado', lista
    api(f'/usuarios/captores/{codigo}/desbloquear', {}, token=admin)
    expect(page.get_by_role('heading', name='Dictaminado y Rutas Eficientes')).to_be_visible(timeout=20000)
    page.screenshot(path=os.path.join(HERE, 'capturas', '05-desbloqueado.png'))

    paso('Administrador: usuarios y para revisar')
    page.get_by_label('Usuario', exact=True).fill('asuarez0'); page.get_by_label('Contraseña', exact=True).fill('Demo2026!')
    page.get_by_role('button', name='Ingresar').click()
    expect(page.get_by_role('heading', name='Gestión de usuarios')).to_be_visible()
    page.get_by_role('link', name='Para revisar').click()
    expect(page.get_by_role('heading', name='Para revisar')).to_be_visible()
    expect(page.get_by_text('Zona Franca')).to_be_visible()
    page.get_by_role('link', name='Auditoría').click()
    expect(page.get_by_text('Desbloqueo de captor').first).to_be_visible()

    paso('Jefe: dashboard y elección de dictamen en conflicto')
    page.get_by_role('button', name='Salir').click()
    expect(page.get_by_role('heading', name='Dictaminado y Rutas Eficientes')).to_be_visible()
    page.get_by_label('Usuario', exact=True).fill('pgimene0'); page.get_by_label('Contraseña', exact=True).fill('Demo2026!')
    page.get_by_role('button', name='Ingresar').click()
    page.get_by_role('link', name='Dashboard').click()
    expect(page.get_by_text('General (incluye tormenta)')).to_be_visible()
    expect(page.get_by_role('img', name='Derivadas por mes')).to_be_visible()
    expect(page.get_by_role('img', name='Por distrito')).to_be_visible()
    expect(page.get_by_role('img', name='Por prioridad')).to_be_visible()
    page.screenshot(path=os.path.join(HERE, 'capturas', '06-dashboard.png'), full_page=True)
    page.get_by_label('Principal').get_by_role('link', name='Solicitudes', exact=True).click()
    page.get_by_text('esperando decisión del Jefe').first.click()
    expect(page.get_by_role('heading', name='Elegir dictamen vigente')).to_be_visible()
    page.get_by_role('button', name='Dejar este como vigente').first.click()
    page.get_by_role('button', name='Confirmar').click()
    expect(page.get_by_text('el dictamen elegido quedó vigente')).to_be_visible()
    page.screenshot(path=os.path.join(HERE, 'capturas', '07-conflicto.png'))

    br.close()
    if errores: print('ERRORES DE CONSOLA:', errores); sys.exit(1)
    print('E2E OK')
