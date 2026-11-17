# Sistema de Dictaminado y Rutas Eficientes — código

Municipalidad de Rosario · Dirección General de Parques y Paseos · Terciario Urquiza, Diseño de Sistemas Web (Comisión 32), Grupo N.° 1.

Implementación de lo que describe `arquitectura-tecnica.md`. Está en tres carpetas:

| Carpeta | Qué es |
|---|---|
| `backend/` | API REST: Node.js + TypeScript + Express, PostgreSQL con Prisma, JWT + refresh token, bcrypt, WebAuthn, PDFKit |
| `frontend/` | PWA: React + Vite + TypeScript, Workbox (service worker), Dexie (IndexedDB), Leaflet, `@simplewebauthn/browser` |
| `e2e/` | Prueba de punta a punta con Chromium (Playwright para Python) |

Los datos de prueba están en `../datos-prueba/` (los mismos del resto de la documentación).

## Cómo correrlo

Requisitos: Node 20 o superior y PostgreSQL 16 (`docker compose up -d` levanta uno).

```bash
cd backend
cp .env.example .env        # completar JWT_SECRET; el resto sirve tal cual para una prueba local
npm install
npm run db:generate         # genera el cliente de Prisma (necesita internet la primera vez)
npm run db:init             # crea las tablas (prisma/init.sql)
npm run seed                # carga los datos de prueba (42 solicitudes, 10 dictámenes, 7 usuarios); sin internet las solicitudes quedan sin geolocalizar (usar GEOCODER=mock)

cd ../frontend
npm install
npm run build               # compila la PWA a frontend/dist

cd ../backend
npm run dev                 # http://localhost:3000  (la API en /api y la PWA en /)
```

Para desarrollar el frontend con recarga en caliente: `npm run dev` en `frontend/` (puerto 5173, con proxy a la API) y, en `backend/.env`, `WEBAUTHN_ORIGIN=http://localhost:5173`.

### Usuarios de prueba (contraseña de todos: `Demo2026!`)

Los nombres de usuario siempre terminan en un número: inicial del nombre + apellido (hasta 6 letras) + 0, 1, 2… (ej. `gboubon0`). Si ya existe, el siguiente libre.


| Usuario | Rol | Para probar |
|---|---|---|
| `mrossi0`, `cbenite0`, `lfernan0` | Operador | rutas, dictámenes, captor |
| `pgimene0` | Jefe | dashboard, pestaña Dictaminadas |
| `asuarez0` | Administrador | usuarios, desbloquear captor, auditoría, "Para revisar" |
| `tmolina0` | Lector | dashboard, tormenta y Dictaminados con descarga de PDF (solo lectura) |
| `jdiaz0` | Operador | existe localmente pero NO está vigente en la Autenticación Institucional simulada: no puede ingresar |

Un usuario creado desde "Gestión de usuarios" solo puede ingresar si además figura como vigente en la Autenticación Institucional. Como es simulada, en desarrollo se lo da de alta con `POST /api/dev/institucional {"nombre_usuario": "..."}`.

### Probarlo en un celular real

WebAuthn (la huella al firmar) y la instalación de la PWA **exigen HTTPS** en el celular (`localhost` solo vale en la misma computadora). La app ya viene lista para servirse de un único origen (el servidor sirve la API y la PWA), así que alcanza con exponer el puerto 3000 por HTTPS. Si no se definen `WEBAUTHN_RP_ID` / `WEBAUTHN_ORIGIN`, el servidor los toma de la cabecera `Origin` del navegador, por lo que funciona con cualquier URL sin tocar nada.

**Opción A: túnel gratuito de Cloudflare (la más rápida, para probar)**

```bash
# una sola vez (Windows): winget install --id Cloudflare.cloudflared
# con el servidor andando en la PC (npm run dev, puerto 3000), en otra terminal:
cd backend && npm run tunel     # muestra la URL https://algo.trycloudflare.com y un código QR para el celular
```

`npm run tunel` controla antes que el servidor responda y que el `.env` no fije `WEBAUTHN_RP_ID` / `WEBAUTHN_ORIGIN` (con `localhost` fijo la huella falla desde el túnel). Conviene `TRUST_PROXY=1` en el `.env` para que el límite de intentos de login distinga a cada usuario detrás del túnel. Algunos routers y proveedores bloquean el dominio `trycloudflare.com` en su DNS. El script lo detecta y pide el túnel igual, resolviendo ese nombre con el DNS público de Cloudflare (1.1.1.1 por HTTPS). En ese caso **un celular conectado al mismo Wi-Fi tampoco abre la URL**: usar los datos móviles, o en Android activar Ajustes → Redes → DNS privado → `1dot1dot1dot1.cloudflare-dns.com`.

o todo en contenedores (necesita `../datos-prueba` junto a `sistema/`):

```bash
docker compose --profile app --profile tunel up --build
docker compose logs tunel | grep trycloudflare      # la URL https para abrir en el celular
```

La URL cambia cada vez y el túnel funciona mientras la PC esté encendida. Sirve para demostrar, no como instalación definitiva.

**Opción B: servidor permanente (la que usa la demo).** Una VM gratuita de Oracle Cloud corre `docker-compose.prod.yml`: base, app, Caddy (HTTPS automático) y copia diaria. Paso a paso en [DESPLIEGUE.md](DESPLIEGUE.md). La app necesita un proceso Node siempre activo (tareas programadas, envío al SUA con reintentos), PostgreSQL y disco para las fotos; por eso se descartaron Vercel, Cloudflare Pages/Workers, Render (se duerme y la base vence), Fly.io, Railway y Koyeb (sin plan gratuito real). Detalle en `documentacion-final/docs/decisiones-tecnicas.md`.

La demo está en `https://proyecto-dictaminadoyrutaseficientes.duckdns.org/`. Para actualizarla, en la VM: `git pull` y `docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build` (aplica `init.sql` solo al arrancar).

La primera vez que un ingeniero firma, la app le pide registrar su huella (una sola vez por usuario y captor).

### Mapa y geocodificación

El mapa usa teselas de OpenStreetMap. La geocodificación usa por defecto **Georef** (API gratuita del Estado nacional, con los tramos de calle del INDEC y sus rangos de altura: ubica por altura exacta, que es lo que le falta a OpenStreetMap en varias avenidas de Rosario) y, si no encuentra la dirección o no tiene altura, **Nominatim** (OpenStreetMap, 1 consulta por segundo como pide su política de uso), siempre limitado a Rosario. `GEOCODER=nominatim` usa solo Nominatim, `GEOCODER=ors` OpenRouteService (con `ORS_API_KEY`) y `GEOCODER=mock` el simulador (lo usan los tests). `npm run geo:rehacer` vuelve a ubicar todas las solicitudes de la base sin borrar nada. Las direcciones se geocodifican una sola vez, al derivar. Si el servicio no responde, la solicitud queda "sin geolocalizar" y se puede ubicar a mano (RF-62). Con el simulador las coordenadas **no** coinciden con la realidad: para ver las solicitudes en su lugar hay que correr con Nominatim u ORS y con internet.

### Tests

```bash
cd backend && npm test              # 86 tests contra una PostgreSQL real (crea la base arbolado_test sola)
cd frontend && npm test             # 15 tests (hash de firma compartido con el servidor, cola cifrada, reanudar sin señal, reglas del formulario)
```

`TEST_DATABASE_URL` cambia la base de pruebas (por defecto `postgresql://postgres:postgres@localhost:5432/arbolado_test`). Si la primera corrida tras arrancar Docker falla por tiempo (30 s), repetirla: es la base recién levantada.

Prueba de punta a punta (con el servidor corriendo y la PWA compilada): `pip install playwright && playwright install chromium`, y desde `e2e/`: `E2E_DATABASE_URL=postgresql://... python3 e2e.py`. Usa un autenticador WebAuthn virtual y simula la pérdida de conexión. Reinicia los datos de prueba al empezar. Deja capturas en `e2e/capturas/`.

## Qué se probó y qué no

**Probado automáticamente**
- Backend (86 tests con PostgreSQL real): login y mensaje genérico (RF-50), límite de intentos (RNF-19), tope de sesión (RNF-20), captores bloqueados y revocados (RF-52, RF-60), auditoría inmutable (RF-54), rutas (criterios, franjas de 2 días, vecino más próximo, recorrido por calles RF-63, caída de ORS, reservas sin duplicar, corte de las 18:00), dictámenes (RF-45, RF-46, RF-56, RF-61, RF-21, fecha del día de la firma, Plantar solo con extracción, idempotencia), firma con WebAuthn por software, sincronización offline e integridad (RF-53), dictamen duplicado: queda el primero que llegó (RF-59), dictaminados con PDF para el Lector (RF-64), envío al SUA con reintentos (RF-25), dashboard, tormenta, catálogo de especies, y carga con 7 ingenieros a la vez (RNF-02, RNF-03, RNF-15).
- Frontend (15 tests): hash de firma idéntico al del servidor, cola offline cifrada, reanudar sin señal, reglas del formulario y fecha en hora de Argentina.

**Verificado a mano**
- Android real: la PWA se instala y la firma con huella funciona.
- OpenRouteService real con la clave del equipo (matriz en alrededor de 1 s; recorrido por calles).
- Docker y la demo en Oracle Cloud: HTTPS, encabezados de seguridad, `/api/dev` apagado y copia diaria.
- Capturas en tamaño celular y escritorio de las pantallas rediseñadas.

**NO probado**
- En el celular real: cámara y modo sin señal.
- El SUA y la Autenticación Institucional son simulados (tablas locales). Los contratos reales pueden ser distintos.
- Auditoría de accesibilidad con herramienta (axe) y revisión en distintos modelos de celular (RNF-09).
- RNF-22 (captor dedicado, sin apagar datos ni Wi-Fi sin desbloquear) es configuración del dispositivo, no del software.

## Decisiones y desvíos respecto de `arquitectura-tecnica.md`

- **bcryptjs** en lugar de `bcrypt` nativo (misma función, sin compilación nativa).
- **Prisma 7 con `@prisma/adapter-pg`**. El esquema (`prisma/schema.prisma`) y un `prisma/init.sql` escrito a mano son equivalentes; con internet se puede reemplazar el SQL por `npx prisma migrate dev --name init`. El SQL incluye el trigger que hace inmutable `registro_auditoria` y el índice único parcial que impide reservar dos veces una solicitud.
- La API cuelga de **`/api`**. Endpoints agregados a los del resumen: `GET /auth/webauthn/estado`, `GET /auth/webauthn/credenciales`, `POST /auth/webauthn/registro/{opciones,verificar}`, `POST /auth/dispositivo/bloqueo`, `GET /auth/dispositivo/:id`.
- **El desafío de WebAuthn es el hash SHA-256 del dictamen**, no un valor emitido por el servidor. Así la huella queda atada a ese contenido exacto y funciona igual sin conexión; la repetición se evita con el UUID único del dictamen. Por eso no se exige el contador de la credencial.
- La cola offline se cifra con AES-GCM (RNF-16) con una clave **no exportable** guardada en IndexedDB. Protege contra la lectura casual y los volcados, pero no reemplaza el cifrado de disco ni el PIN del captor.
- Dictamen duplicado (RF-59): en línea el segundo se rechaza; si llega por sincronización, queda vigente el primero que llegó y el otro se guarda en el historial como no vigente. Ya no elige un Jefe (16/11/2026).
- Endpoints solo de desarrollo (no existen con `NODE_ENV=production`): `/api/dev/simular` (caídas de SUA, ORS, geocodificador y Autenticación), `/api/dev/institucional`, `/api/dev/reset-throttle`. Los retos de registro de WebAuthn se guardan en memoria (una sola instancia del servidor).

## Pendientes y cuestiones abiertas

- **Motivo de extracción:** se modeló como una sola opción; falta confirmar si el formulario en papel permite marcar más de una.
- `POST /auth/dispositivo/bloqueo` no pide sesión (el captor aún no inició sesión cuando se bloquea); el UUID aleatorio del captor hace de secreto. Un atacante que conozca ese UUID podría bloquearlo, nunca desbloquearlo.
- Falta pulir cuando haya un celular real: tamaños de foto, textos y flujos de error.
