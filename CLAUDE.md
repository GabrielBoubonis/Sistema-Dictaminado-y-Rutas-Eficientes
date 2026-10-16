# Contexto del proyecto para asistentes de código (Claude Code, Antigravity, etc.)

Leé este archivo completo antes de tocar nada. Está escrito para retomar el desarrollo sin la conversación anterior.

## 1. Qué es

**Sistema de Dictaminado y Rutas Eficientes**: PWA para que los ingenieros agrónomos de la Dirección General de Parques y Paseos (Municipalidad de Rosario) armen una ruta diaria de solicitudes de arbolado, completen y firmen dictámenes técnicos en el campo (también sin conexión) y los sincronicen con el SUA. Incluye dashboard para la Dirección.

- Trabajo práctico: Terciario Urquiza, Diseño de Sistemas Web, Comisión 32, docente Pedernera Pablo, Grupo N.° 1.
- El código implementa lo que describen los documentos (`documentacion-final/docs/arquitectura-tecnica.md` y demás, ver sección 9). Si el código y un documento se contradicen, avisá al usuario antes de decidir cuál cambia.

## 2. Cómo trabajar con el usuario

- Idioma: **español rioplatense**, trato de vos, tono claro y breve. Sin jerga innecesaria.
- Escribí **bien las mayúsculas y los acentos (ñ incluida)** y usá **guiones medios** en nombres de archivos y carpetas, nunca guiones bajos, salvo los que ya existen por convención (`_word.txt`, `casos_de_uso.md`, `Trabajo_Practico_Anual_Seguridad`).
- Todo debe ser **gratuito y de código abierto**. No propongas servicios pagos.
- **Sé honesto sobre lo que no se pudo verificar**: celular real, clave real de OpenRouteService, Nominatim real, teselas reales, Docker, despliegue. Lo no probado se dice, no se da por hecho.
- Los requisitos nuevos continúan la numeración: el máximo actual es **RF-62** y **RNF-22**. No renumeres ni reutilices IDs.
- No regeneres `Documentacion_Tecnica_Completa.docx` salvo que el usuario lo pida.
- No hagas commits ni push sin que lo pidan.

## 3. Stack

| Capa | Tecnología |
|---|---|
| Backend | Node 20+ y TypeScript, Express bajo `/api`, Prisma 7 con `@prisma/adapter-pg`, PostgreSQL 16, bcryptjs, JWT + refresh, `@simplewebauthn/server` v10, PDFKit, zod |
| Frontend | React 18, Vite 5, TypeScript, `vite-plugin-pwa` (Workbox), Dexie (IndexedDB), Leaflet, `@simplewebauthn/browser` v10 |
| Tests | Jest + supertest contra PostgreSQL real; Vitest + fake-indexeddb; Playwright (Python) de punta a punta |
| Mapa y rutas | Teselas OpenStreetMap; geocodificación Georef + respaldo Nominatim (por defecto), OpenRouteService (con `ORS_API_KEY`) o simulador (`GEOCODER=mock`); matriz de distancias ORS |

Desvíos conocidos respecto de la documentación: bcryptjs en vez de bcrypt nativo; `prisma/init.sql` escrito a mano en vez de `prisma migrate`; el service worker lo genera `vite-plugin-pwa`; API bajo `/api`; endpoints extra de WebAuthn y captor.

## 4. Estructura del repo

```
sistema/                               código
  backend/
    prisma/{schema.prisma,init.sql}    esquema; init.sql aplica el trigger de auditoría inmutable y el índice único parcial de reservas
    src/{app,server,config,db,security,catalogos,jobs,seed,seed-si-vacia}.ts
    src/providers/index.ts             SUA y autenticación simulados (interfaces IAuthProvider, IReclamoProvider), geocodificadores y matriz de distancias
    src/routes/*.ts  src/services/*.ts auth, usuarios, solicitudes, rutas, dictamenes, sync, especies, revision, auditoria, dashboard, tormenta
    src/catalogos.json                 listas cerradas del dictamen (copia en frontend/src y en datos-prueba)
    test/*.test.ts                     66+ tests; test/soft-authenticator.ts simula una huella por software
  frontend/src/{pages,components,lib}  lib/offline (cola cifrada), lib/canonical.ts (hash de firma), lib/reglas.ts (validación del formulario)
  e2e/e2e.py                           prueba de punta a punta con Chromium
  Dockerfile, docker-compose.yml       sin ejecutar nunca (ver sección 8)
datos-prueba/                          datos de prueba (el seed los lee de sistema/backend/src/../../../datos-prueba)
documentacion-final/                   documentos del TP (ver sección 9)
```

## 5. Comandos

```bash
cd sistema/backend
cp .env.example .env            # completar JWT_SECRET
npm install
PRISMA_SCHEMA_ENGINE_BINARY=/bin/true npx prisma generate   # si prisma generate falla bajando el engine (sin internet); en Windows: probar `npx prisma generate` normal
npm run db:init                 # aplica prisma/init.sql (idempotente)
npm run seed                    # 42 solicitudes, 10 dictámenes, usuarios; geocodifica con Nominatim (~1 min, necesita internet) o usar GEOCODER=mock
npm run dev                     # http://localhost:3000 (API en /api, PWA compilada en /)
npm test                        # crea arbolado_test solo; TEST_DATABASE_URL cambia la base

cd ../frontend && npm install && npm run build && npm test
cd ../e2e && E2E_DATABASE_URL=postgresql://... GEOCODER=mock python3 e2e.py   # con el servidor andando y la PWA compilada
```

Variables importantes (`sistema/backend/.env`): `DATABASE_URL`, `JWT_SECRET` (≥ 24 caracteres en producción), `GEOCODER` (`nominatim`|`ors`|`mock`), `ORS_API_KEY`, `WEBAUTHN_RP_ID` / `WEBAUTHN_ORIGIN` (si se omiten se toman de la cabecera `Origin`), `TRUST_PROXY`, `UPLOADS_DIR`, `BCRYPT_COST`.

Usuarios de prueba (clave `Demo2026!`): `mrossi0`, `cbenite0`, `lfernan0` (Operador), `pgimene0` (Jefe), `asuarez0` (Administrador), `tmolina0` (Lector), `jdiaz0` (no vigente en la autenticación institucional simulada). Los nombres generados siempre terminan en número (`gboubon0`, luego `gboubon1`). Captores de prueba: `K7M2-X9QD` (Bloqueado), `R3TB-44LN` (Revocado), `M5HW-2PZA` (Activo).

Equipo del usuario: Windows 11, Node 24, Docker Desktop instalado; PostgreSQL no instalado de forma nativa (usar Docker).

## 6. Decisiones de diseño que no hay que romper

- **Firma**: JSON canónico (claves ordenadas, sin espacios) + SHA-256 (`contenidoFirmado`). El desafío de WebAuthn es ese hash, así funciona sin conexión; el contador de la credencial no se exige; la repetición se evita con el UUID único. El hash del navegador y el del servidor deben coincidir: `scripts/vector-canonico.ts` regenera `frontend/src/lib/vector-canonico.json` y hay test compartido. **Si cambiás campos del dictamen, regenerá el vector** (`npx tsx scripts/vector-canonico.ts > ../frontend/src/lib/vector-canonico.json`).
- **Idempotencia** por UUID del dictamen. Conflicto (RF-59): dos dictámenes firmados distintos dejan `vigente = null` y el Jefe elige. Falla de integridad (RF-53): se guarda `vigente = false` + caso de revisión. Las solicitudes en conflicto no entran en rutas.
- **Rutas**: franjas de 2 días de antigüedad, vecino más próximo con matriz ORS (o respaldo solo por antigüedad), pool ≤ 100 puntos, corte a las 18:00 ART, reserva atómica con índice único parcial.
- **Sesión**: JWT 30 min + refresh con tope de 7 días; reanudar sin señal solo el mismo día; bloqueo de captor a los 5 intentos, desbloqueo por Administrador con código XXXX-XXXX; límite de intentos de login con espera creciente.
- **Offline**: cola y borradores cifrados con AES-GCM con clave no exportable en IndexedDB; PBKDF2 local para reanudar sesión. Se envía al SUA con reintentos de espera exponencial.
- **Dashboard**: cuenta eventos de derivación (cada re-derivación es un evento). Devuelve `general`, `tormenta`, `por_distrito`, `por_prioridad`, `por_mes`.
- **Seguridad HTTP** (`src/security.ts`): CSP con `img-src` para `tile.openstreetmap.org`, HSTS, X-Frame-Options DENY y **`Referrer-Policy: strict-origin-when-cross-origin`** (OpenStreetMap bloquea las teselas si falta el Referer).
- Listas cerradas del dictamen (RF-56): el servidor rechaza valores fuera de `catalogos.json`. Única excepción: agregar especie.
- **Decisiones del usuario ya aplicadas**: no existe "calle de esquina"; nota y expediente son opcionales; "Agrandar cazuela" pertenece a **Plantar** (plantar árboles), no a trabajos subterráneos (que tiene solo corte vertical y horizontal de raíces). La dirección del reclamo es la del árbol: `domicilio_ejemplar` se copia de `Solicitud.direccion` y el ingeniero solo ajusta en el mapa la ubicación exacta (`latitud_ejemplar`/`longitud_ejemplar`); no hay geocodificación inversa (documentos ajustados el 16/10/2026).
- Endpoints solo de desarrollo (no existen con `NODE_ENV=production`): `/api/dev/simular`, `/api/dev/institucional`, `/api/dev/reset-throttle`.

## 7. Estado actual

Hecho y verificado: 72 tests de backend (también en el equipo del usuario, 15/10/2026), 11 de frontend, prueba de punta a punta (login, ruta, 5 pasos del dictamen, firma con autenticador virtual, repetir sin conexión, sincronizar, bloqueo/desbloqueo, pantallas de Administrador y Jefe).

## 8. Pendiente y problemas abiertos (empezá por acá)

1. **Teselas del mapa: resuelto (15/10/2026).** El service worker (Workbox) descarga las teselas con `fetch()` bajo la CSP de `sw.js`; faltaba `tile.openstreetmap.org` en `connect-src`. Tras cambiar la CSP hay que desregistrar el service worker viejo (F12 → Application → Service workers).
2. **Geocodificación: resuelta (15/10/2026).** `GeorefGeocoder` (por defecto): API Georef del Estado nacional con los tramos de calle del INDEC, ubica por altura exacta dentro de la localidad Rosario; si no encuentra prueba sin el tipo de calle y después cae a Nominatim (consulta estructurada, `bounded=1`). `npm run geo:rehacer` recalcula las coordenadas de la base sin borrar nada. En `datos-prueba/` se reemplazaron 9 direcciones con alturas inexistentes (Av. Alberdi 2364/5337/1587/1450, Av. Génova 2764/2500, Av. Illia 537/664, Av. Jorge Newbery 800) por direcciones reales verificadas con ambos servicios, y los distritos se recalcularon con los polígonos de los 6 distritos de OpenStreetMap (admin_level 9). "Pasaje sin nombre s/n" queda sin ubicar a propósito.
3. **Túnel para el celular**: `npm run tunel` (`backend/scripts/tunel.js`) abre un túnel rápido de Cloudflare, controla servidor y `.env` y muestra URL + QR. `cloudflared` instalado en el equipo del usuario con winget. El router del usuario bloquea todo `trycloudflare.com` en su DNS (argotunnel.com sí resuelve): el script lo detecta y pide el túnel con `--quick-service` a un intermediario local que conecta a la IP obtenida por DNS sobre HTTPS (1.1.1.1). **Verificado el 16/10/2026**: túnel abierto, `/api/health` y la página responden por la URL pública. El celular debe usar datos móviles o DNS privado de Android (`1dot1dot1dot1.cloudflare-dns.com`), porque en ese Wi-Fi tampoco resuelve la URL. Falta: registro de huella y firma en un Android real (cámara, instalar app, modo sin conexión).
4. **Docker: probado en la PC del usuario (16/10/2026).** `docker-compose.prod.yml` (db sin puertos, app compilada con `tsc` y `node`, usuario sin privilegios, Caddy con HTTPS automático, backup diario en `sistema/backups/`), `Caddyfile`, `.env.prod.example`. El ignore de la imagen es `sistema/Dockerfile.dockerignore` (el contexto es la raíz del repo). Verificado con `DOMINIO=localhost` y puertos 8080/8443: datos cargados, HTTPS, login, encabezados, 404 en `/api/dev`, backup. El `docker-compose.yml` de desarrollo (perfiles app/tunel) no se volvió a probar.
5. **Despliegue permanente: elegido Oracle Cloud Always Free** (VM ARM 2 OCPU/12 GB + DuckDNS + Caddy), guía en `sistema/DESPLIEGUE.md`. Falta que el usuario cree la cuenta y la VM; nada probado todavía en Oracle (compilación ARM incluida). Descartados (oct. 2026): Render (duerme a los 15 min, base expira a 30 días, sin disco), Fly.io/Railway/Koyeb (sin plan gratuito real), Vercel (no corre el backend).
6. OpenRouteService real: el código está escrito pero nunca se ejecutó con una clave.
7. Pendientes funcionales conversados: requisito para historial de rutas (propuesto como R-07), confirmar con la Dirección si un ejemplar puede tener más de un motivo de extracción, sincronizar los documentos calificados con los desvíos del código (bcryptjs, init.sql, prefijo `/api`, endpoints extra). Ya sincronizado (16/10/2026): proveedor de geocodificación (Georef + Nominatim) y dirección del ejemplar.
8. Sin hacer: auditoría de accesibilidad con herramienta (axe), pruebas de carga (RNF-15), backups (RNF-11).

## 9. Documentación

Vive en `documentacion-final/` (`docs/` y `diagramas/`): `stakeholders`, `requisitos`, `alcance`, `historias-de-usuario`, `casos-de-uso`, `DoR`, `slicing`, `er-modelo`, `diseño-ui`, `dictamen-tecnico-campos`, `arquitectura-tecnica`, más `diagramas/` (PlantUML y wireframes SVG). Los datos de prueba están en `datos-prueba/`.

Convenciones: cada `.md` calificado tiene un gemelo `*_word.txt` en texto plano (sin sintaxis markdown; tablas como `A | B | C` sin barras externas). Si editás uno, editá el otro. Las notas dentro de los `.md` son breves; el detalle técnico va en `arquitectura-tecnica.md`. Devolución del profe (13/10/2026): 64/65; ya se corrigieron la tabla de Entregas del README, `slicing.md` en minúscula, la oración duplicada de la Decisión 10 y RNF-02 ("hasta 7 ingenieros"). La nota final todavía no está cerrada.
