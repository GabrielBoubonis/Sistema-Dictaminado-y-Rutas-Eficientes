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
npm run seed                # carga los datos de prueba (42 solicitudes, 10 dictámenes, 7 usuarios)

cd ../frontend
npm install
npm run build               # compila la PWA a frontend/dist

cd ../backend
npm run dev                 # http://localhost:3000  (la API en /api y la PWA en /)
```

Para desarrollar el frontend con recarga en caliente: `npm run dev` en `frontend/` (puerto 5173, con proxy a la API) y, en `backend/.env`, `WEBAUTHN_ORIGIN=http://localhost:5173`.

### Usuarios de prueba (contraseña de todos: `Demo2026!`)

| Usuario | Rol | Para probar |
|---|---|---|
| `mrossi`, `cbenite`, `lfernan` | Operador | rutas, dictámenes, captor |
| `pgimene` | Jefe | dashboard, elegir dictamen vigente cuando hay dos |
| `asuarez` | Administrador | usuarios, desbloquear captor, auditoría, "Para revisar" |
| `tmolina` | Lector | dashboard y tormenta (solo lectura) |
| `jdiaz` | Operador | existe localmente pero NO está vigente en la Autenticación Institucional simulada: no puede ingresar |

Un usuario creado desde "Gestión de usuarios" solo puede ingresar si además figura como vigente en la Autenticación Institucional. Como es simulada, en desarrollo se lo da de alta con `POST /api/dev/institucional {"nombre_usuario": "..."}`.

### Probarlo en un celular real

WebAuthn (la huella al firmar) y la instalación de la PWA **exigen HTTPS** en el celular (`localhost` solo vale en la misma computadora). Opciones gratuitas: un túnel como `cloudflared tunnel --url http://localhost:3000`, o desplegarlo detrás de un dominio con certificado. Hay que ajustar en `backend/.env`:

```
WEBAUTHN_RP_ID=el-dominio-del-tunel
WEBAUTHN_ORIGIN=https://el-dominio-del-tunel
```

y abrir la app desde esa dirección. La primera vez que un ingeniero firma, la app le pide registrar su huella (una sola vez por usuario y captor).

### Tests

```bash
cd backend && npm test              # 63 tests contra una PostgreSQL real (crea la base arbolado_test sola)
cd frontend && npm test             # 11 tests (hash de firma compartido con el servidor, cola cifrada, reanudar sin señal, reglas del formulario)
```

`TEST_DATABASE_URL` cambia la base de pruebas (por defecto `postgresql://postgres:postgres@localhost:5432/arbolado_test`).

Prueba de punta a punta (con el servidor corriendo y la PWA compilada): `pip install playwright && playwright install chromium`, y desde `e2e/`: `E2E_DATABASE_URL=postgresql://... python3 e2e.py`. Usa un autenticador WebAuthn virtual y simula la pérdida de conexión. Reinicia los datos de prueba al empezar. Deja capturas en `e2e/capturas/`.

## Qué se probó y qué no

**Probado automáticamente**
- Backend (63 tests con PostgreSQL real): login y mensaje genérico (RF-50), límite de intentos con espera creciente (RNF-19), caída de la Autenticación Institucional sin contar como intento, tope de sesión de 7 días (RNF-20), bloqueo, desbloqueo y revocación de captores con auditoría (RF-52, RF-60), auditoría inmutable a nivel de base de datos (RF-54), rutas (distrito opcional, cantidades por prioridad, zona, franjas de 2 días, vecino más próximo, caída de ORS, reservas sin duplicar aunque dos ingenieros pidan a la vez, corte de las 18:00), dictámenes (RF-45, RF-46, RF-56, RF-61, RF-21 con dos envíos simultáneos, idempotencia por UUID), segundo factor WebAuthn con un autenticador por software (la aserción tiene que corresponder al contenido y a una credencial del mismo usuario), hash de firma, sincronización offline con integridad no verificada (RF-53), conflicto entre dos dictámenes y elección del Jefe (RF-59), envío al SUA con reintentos de espera creciente (RF-25), dashboard (RF-37 y RF-44), tormenta, validación de datos del SUA (RNF-18).
- Frontend (11 tests): el hash de firma calculado en el navegador coincide con el del servidor para el mismo dictamen; la cola offline se guarda cifrada y no se puede alterar; reanudar sin señal solo el mismo día y antes de los 7 días; reglas del formulario.
- Prueba de punta a punta en Chromium con pantalla de celular: login, generar ruta, completar los 5 pasos, registrar huella y firmar (autenticador virtual), repetir **sin conexión** (queda cifrado en IndexedDB y no llega al servidor), volver la conexión (se sincroniza solo y se vacía la cola), reanudar sin señal, bloqueo a los 5 intentos con código y desbloqueo por un Administrador, y las pantallas de Administrador y Jefe.

**NO probado — conviene que lo verifique quien tenga el celular**
- Un Android real: huella o reconocimiento facial reales, cámara, "Instalar app", comportamiento del service worker y de IndexedDB con poca memoria, rendimiento.
- OpenRouteService real: no había clave ni salida a internet, así que se usó el simulador (distancias en línea recta × 1,3). El código que llama a la API real está escrito pero no se ejecutó.
- El SUA y la Autenticación Institucional son simulados (tablas locales). Los contratos reales pueden ser distintos.
- Mapa sin conexión: solo se ven las teselas que ya se miraron con señal; los puntos y la ruta sí se dibujan.
- No se hizo una auditoría formal de accesibilidad (hay etiquetas, foco visible, contraste alto y botones de 48 px, pero no se corrió una herramienta como axe), ni pruebas de carga (RNF-15), ni backups (RNF-11). RNF-22 (captor dedicado, sin apagado ni modo avión sin PIN) es configuración del dispositivo, no del software.

## Decisiones y desvíos respecto de `arquitectura-tecnica.md`

- **bcryptjs** en lugar de `bcrypt` nativo (misma función, sin compilación nativa).
- **Prisma 7 con `@prisma/adapter-pg`**. El esquema (`prisma/schema.prisma`) y un `prisma/init.sql` escrito a mano son equivalentes; con internet se puede reemplazar el SQL por `npx prisma migrate dev --name init`. El SQL incluye el trigger que hace inmutable `registro_auditoria` y el índice único parcial que impide reservar dos veces una solicitud.
- La API cuelga de **`/api`**. Endpoints agregados a los del resumen: `GET /auth/webauthn/estado`, `GET /auth/webauthn/credenciales`, `POST /auth/webauthn/registro/{opciones,verificar}`, `POST /auth/dispositivo/bloqueo`, `GET /auth/dispositivo/:id`.
- **El desafío de WebAuthn es el hash SHA-256 del dictamen**, no un valor emitido por el servidor. Así la huella queda atada a ese contenido exacto y funciona igual sin conexión; la repetición se evita con el UUID único del dictamen. Por eso no se exige el contador de la credencial.
- La cola offline se cifra con AES-GCM (RNF-16) con una clave **no exportable** guardada en IndexedDB. Protege contra la lectura casual y los volcados, pero no reemplaza el cifrado de disco ni el PIN del captor.
- Las solicitudes en conflicto (dos dictámenes firmados, RF-59) no entran en rutas y no se pueden dictaminar en línea hasta que un Jefe elige.
- Endpoints solo de desarrollo (no existen con `NODE_ENV=production`): `/api/dev/simular` (caídas de SUA, ORS, geocodificador y Autenticación), `/api/dev/institucional`, `/api/dev/reset-throttle`. Los retos de registro de WebAuthn se guardan en memoria (una sola instancia del servidor).

## Pendientes y cuestiones abiertas

- **Calle esquina (RF-56):** no existe un catálogo de calles, así que el formulario sugiere las calles de las solicitudes cargadas, pero el servidor acepta cualquier texto de hasta 120 caracteres. Para cumplir la lista cerrada hace falta un catálogo (por ejemplo, del callejero municipal).
- **Motivo de extracción:** se modeló como una sola opción; falta confirmar si el formulario en papel permite marcar más de una.
- `POST /auth/dispositivo/bloqueo` no pide sesión (el captor aún no inició sesión cuando se bloquea); el UUID aleatorio del captor hace de secreto. Un atacante que conozca ese UUID podría bloquearlo, nunca desbloquearlo.
- Falta pulir cuando haya un celular real: tamaños de foto, textos y flujos de error.
