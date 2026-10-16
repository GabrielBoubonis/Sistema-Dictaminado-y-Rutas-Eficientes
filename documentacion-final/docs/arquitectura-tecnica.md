# Arquitectura técnica

_Este documento no forma parte de las plantillas que exige la cátedra (Requisitos,
Historias de Usuario, Casos de Uso, DoR, Slicing, Modelo ER, Diseño UI): es un complemento
para que cualquier persona o agente de IA que tenga que **construir** el sistema a partir
de esta documentación cuente con las decisiones técnicas concretas que los documentos de
cátedra solo mencionan de forma funcional. Los `.md` existentes llevan una nota breve que
apunta acá en los puntos donde esto aplica; el detalle completo vive únicamente en este
archivo, para no romper el formato exigido en los demás._

_Todas las piezas elegidas son gratuitas / de código abierto, sin costo de licencia ni de
uso en el volumen de esta demo (hasta 7 ingenieros, ~70 dictámenes/día)._

---

## 1. Stack tecnológico

| Capa | Elección | Motivo |
|---|---|---|
| Backend | Node.js + TypeScript + Express | Gratuito, mismo lenguaje que el frontend (menor curva para el equipo), tipado fuerte reduce errores de contrato entre módulos. |
| Base de datos | PostgreSQL | Gratuita/OSS, soporta bien los tipos del Modelo ER (claves compuestas de `Solicitud`, JSON para campos opcionales), con opciones de hosting gratuito para la demo (Neon, Supabase, Railway — capa free). |
| ORM | Prisma | Gratuito, genera tipos TypeScript desde el esquema (`prisma/schema.prisma`). El esquema se aplica con `prisma/init.sql`, un script SQL idempotente escrito a mano que además crea el trigger que vuelve inmutable la auditoría (RF-54) y el índice único parcial de reservas (RF-16), que `prisma migrate` no genera. |
| Frontend | React + Vite | Gratuito, ecosistema grande, Vite da un build rápido y soporte nativo para PWA vía plugin. |
| PWA / offline | Workbox (Service Worker) + Dexie.js (IndexedDB) | Ambos gratuitos/OSS. Workbox cachea los assets de la app; Dexie maneja la cola de dictámenes/fotos "pendiente de sincronizar" (RF-31 a RF-34) con una API más simple que IndexedDB nativo. |
| Autenticación | JWT (librería `jsonwebtoken`) + bcrypt (librería `bcryptjs`, la misma función de hash sin compilación nativa) + WebAuthn (`@simplewebauthn/server` y `/browser`) | Las tres son gratuitas/OSS. WebAuthn resuelve RF-51 usando el sensor biométrico que ya tienen los captores Android, sin depender de SMS/email. |
| Mapas y ruteo | OpenRouteService (API gratuita con clave; cada matriz de distancias admite hasta 3500 pares de puntos, por eso se consulta con hasta 59) + Leaflet (mapa interactivo, OSS) con teselas de OpenStreetMap | Cubre RNF-14: cálculo de distancia/tiempo a pie y en vehículo, y dibujo de zona en el mapa (RF-15) sin costo. |
| Geocodificación | Georef (API gratuita del Estado nacional, tramos de calle del INDEC con rangos de altura) con respaldo en Nominatim (OpenStreetMap, gratuito, 1 consulta por segundo) | Ubica cada dirección por su altura exacta dentro de Rosario; OpenStreetMap no tiene cargadas las alturas de varias avenidas. Ambos sin costo ni clave. |
| Rate limiting | `express-rate-limit` | Gratuito/OSS, cubre RNF-19. |
| Testing | Jest + supertest contra PostgreSQL real (backend) + Vitest (frontend) + Playwright (prueba de punta a punta en Chromium) | Todos gratuitos/OSS, estándar en el ecosistema Node/React. |
| PDF del dictamen | PDFKit | Gratuito/OSS, genera el PDF imprimible en el servidor (RF-26). |
| Validación de datos | zod | Gratuito/OSS, valida cada pedido y cada registro del SUA contra un esquema (RF-56, RNF-18). |
| Cabeceras de seguridad | helmet | Gratuito/OSS, aplica CSP, HSTS y X-Frame-Options (RNF-21). |
| Hosting de la demo | Máquina virtual Always Free de Oracle Cloud con Docker Compose (PostgreSQL, la app, Caddy con certificado HTTPS de Let's Encrypt y backup diario) + subdominio gratuito de DuckDNS | Sin costo, siempre encendida y con disco propio para fotos y backups. Se descartaron los planes gratuitos de Render, Railway, Fly.io y Koyeb (se duermen, vencen o ya no existen) y Vercel/Netlify (no corren el backend). Para producción real, el CIL define el hosting institucional (fuera de este alcance, ver `alcance.md` §3). |

**Fuera de esta elección (y por qué):** no se propone GraphQL (REST alcanza para la
cantidad de recursos del sistema, y es más simple de documentar con OpenAPI) ni un
framework de backend más pesado (NestJS, etc. — Express es suficiente para el tamaño de
este proyecto y reduce la curva de entrada).

---

## 2. Contrato de API interno (resumen)

API REST bajo el prefijo `/api`, JSON, autenticación por JWT en el header
`Authorization: Bearer <token>` salvo en `/auth/login`, `/auth/refresh` y `/health`.
Agrupado por módulo de `requisitos.md`:

| Recurso | Endpoints principales | RF relacionados |
|---|---|---|
| `/auth` | `POST /auth/login` (paso 1 y 2, RF-01 a RF-03), `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/revalidar` (al volver la conexión tras reanudar sin señal, RF-57), `GET /auth/webauthn/estado`, `GET /auth/webauthn/credenciales`, `POST /auth/webauthn/registro/opciones` y `POST /auth/webauthn/registro/verificar` (alta de la huella del captor, RF-51), `POST /auth/dispositivo/bloqueo` y `GET /auth/dispositivo/:id` (bloqueo local y consulta del desbloqueo, RF-52, RF-60) | RF-01 a RF-05, RF-50 a RF-52, RF-57, RF-60 |
| `/usuarios` | `GET /usuarios`, `POST /usuarios`, `PATCH /usuarios/:id`, `POST /usuarios/:id/reset-password`, `POST /usuarios/:id/revocar-captor`, `GET /usuarios/captores-bloqueados?codigo=`, `POST /usuarios/captores/:codigo/desbloquear` | RF-06 a RF-08, RF-52, RF-60 |
| `/solicitudes` | `GET /solicitudes` (filtros de estado/distrito), `GET /solicitudes/:numeroSua/:anio` | RF-09 a RF-13 |
| `/rutas` | `POST /rutas` (generar; acepta la ubicación actual del captor como partida, RF-14 a RF-19, RF-47 a RF-49), `GET /rutas/activa`, `POST /rutas/:id/restablecer` | RF-14 a RF-19, RF-47 a RF-49 |
| `/dictamenes` | `POST /dictamenes` (completar y firmar, con la aserción WebAuthn incluida), `GET /dictamenes/:id`, `GET /dictamenes/:id/fotos/:orden`, `GET /dictamenes/:numeroSua/:anio/historial`, `GET /dictamenes/:id/pdf`, `GET /dictamenes/:numeroSua/:anio/conflicto` y `POST /dictamenes/:id/vigente` (solo Jefe, RF-59) | RF-20 a RF-29, RF-45, RF-46, RF-51, RF-59, RF-61 |
| `/sync` | `POST /sync/dictamenes` (cola offline → servidor, recalcula hash y verifica la aserción WebAuthn, RF-53) | RF-30 a RF-34, RF-51, RF-53 |
| `/especies` | `GET /especies?q=` (búsqueda para el selector), `POST /especies` (agregar una especie nueva, normalizada y sin duplicados) | RF-56 |
| `/dashboard` | `GET /dashboard?mes=&anio=` | RF-35 a RF-37, RF-44 |
| `/tormenta` | `GET /tormenta`, `POST /tormenta/rutas` (acepta la ubicación actual como partida) | RF-38 a RF-43 |
| `/auditoria` | `GET /auditoria?usuario=&accion=&desde=&hasta=` | RF-54, RF-55 |
| `/revision` | `GET /revision` (apartado "Para revisar", solo Administrador, solo lectura) | RF-58, RNF-18 |
| `/health` | `GET /health` (estado del servidor; la PWA lo usa para detectar que volvió la conexión) | RF-33 |

El segundo factor (RF-51) no tiene endpoint propio: la aserción WebAuthn viaja dentro de
`POST /dictamenes` y de `POST /sync/dictamenes`, porque la firma también se hace sin
conexión y el desafío es el hash del contenido firmado.

Cada endpoint de escritura que modifica usuarios o captores dispara
internamente un registro en `/auditoria` (RF-54) — no es un endpoint que el cliente llame
por separado.

---

## 3. Esquemas simulados para la demo (SUA y Autenticación Institucional)

El alcance del proyecto establece que la demo usa dos bases precargadas, simuladas, sin
llamadas HTTP reales. Estos son los esquemas mínimos propuestos para esas dos bases —
**son una aproximación para la demo, no el contrato real del SUA** (ver `alcance.md` §5,
"el esquema de campos usado en este documento es una aproximación, sujeto a validación
posterior con el CIL y el equipo del SUA").

**Mock SUA — tabla `solicitudes_sua`:**

```
numero_sua (string), anio (int), tipo (string, fijo "reclamo"),
subtipo (string, fijo "problema con el arbolado público"),
area_derivada (string, fijo "Parques y Paseos - Dirección Técnica"),
distrito (string), prioridad (string), direccion (string),
descripcion_reclamo (string), es_tormenta (boolean),
es_rederivacion (boolean), fecha_derivacion (date)
```

**Mock Autenticación Institucional — tabla `usuarios_institucionales`:**

```
nombre_usuario (string), vigente (boolean), nombre_completo (string)
```

El conector propio del sistema (`IReclamoProvider`, `IAuthProvider` — ver
`stakeholders.md`) se implementa contra estas tablas mock en la demo, y se reemplaza por
las llamadas HTTP reales sin tocar el resto del sistema cuando el CIL confirme el esquema y
las credenciales de producción.

**Tablas técnicas de soporte** (no son entidades del dominio, por eso no figuran en
`er-modelo.md`):

| Tabla | Para qué |
|---|---|
| `refresh_token` | Sesiones abiertas: hash del refresh token, captor, fecha del primer ingreso (tope de 7 días, RNF-20) y revocación (RF-52). |
| `webauthn_credential` | Huellas registradas por usuario y captor: clave pública y contador (RF-51). |
| `sua_datos_complementarios` | Lo que el sistema envió al SUA por cada dictamen (RF-24), en la demo en lugar de la API real. |

---

## 4. Mecanismos de seguridad (detalle de implementación)

| Mecanismo | Elección concreta | RF/RNF que resuelve |
|---|---|---|
| Hash de firma del dictamen | SHA-256 sobre el JSON canónico del dictamen (campos ordenados, sin espacios) | RF-22, RF-53 |
| Hashing de contraseñas | bcrypt (librería `bcryptjs`), costo 12 | RNF-05 |
| Segundo factor al firmar | WebAuthn (biometría del dispositivo); ver wireframe `04b-segundo-factor.svg` | RF-51 |
| Cifrado at-rest en el captor | AES-GCM (Web Crypto API) con una clave aleatoria creada en el captor como no exportable y guardada en IndexedDB: sirve para cifrar y descifrar, pero no se puede leer ni copiar a otro equipo. No depende de la sesión, así la cola se sincroniza aunque la sesión se haya cerrado (RF-33); el equipo bloqueado y cifrado (RNF-22) completa la protección | RNF-16 |
| Borrado post-sincronización | al confirmarse la sincronización (RF-33), se eliminan de IndexedDB la fotografía y el dictamen ya enviados | RNF-16 |
| Rate limiting server-side | 10 intentos fallidos / 15 min por combinación IP + usuario (también para usuarios inexistentes), backoff exponencial; capa distinta del bloqueo local a los 5 intentos del captor | RNF-19, RF-52 |
| Validación de campos cerrados | el servidor valida cada campo de lista cerrada contra su enumeración o tabla de catálogo y responde 422 ante cualquier valor fuera de ella | RF-56 |
| Sesión | JWT corto (30 min) + refresh token con tope absoluto de 7 días | RF-04, RF-05, RNF-20 |
| Cabeceras HTTP | CSP `default-src 'self'` (con excepciones solo para las teselas de OpenStreetMap y OpenRouteService), HSTS, `X-Frame-Options: DENY` y `Referrer-Policy: strict-origin-when-cross-origin` (OpenStreetMap exige el Referer) en todas las respuestas | RNF-21 |

---

## 5. Algoritmo de selección y ruteo (RF-47, RF-48, RF-49)

1. **Filtrado:** se filtran las solicitudes pendientes según distrito (si se indicó),
   prioridad y/o zona dibujada en el mapa (polígono, verificado con un chequeo
   punto-en-polígono sobre la coordenada de la solicitud).
2. **Selección cuando sobran candidatas (RF-47):**
   - Se agrupan las solicitudes filtradas en **franjas de antigüedad de 2 días corridos**
     (todas las solicitudes derivadas dentro de la misma franja se consideran "igual de
     antiguas" a efectos prácticos).
   - Se recorren las franjas de la más antigua a la más nueva. Dentro de cada franja, se
     ordenan por **distancia estimada en metros** (ver punto 3) respecto del punto ya
     seleccionado más cercano (heurística de vecino más próximo, acumulativa).
   - Se completa el cupo pedido por el ingeniero siguiendo ese orden.
3. **Cálculo de distancia/tiempo (RNF-14):** cada solicitud ya tiene `latitud`/`longitud`
   cacheadas (geocodificadas una sola vez al momento de la derivación, con Georef y, si no
   encuentra la dirección, con Nominatim, siempre limitado a Rosario — ver `er-modelo.md`,
   Decisión 9), así que generar una
   ruta no geocodifica de nuevo. Se consulta la API de Matrix de OpenRouteService (perfil
   `foot-walking` o `driving-car` según el modo elegido, RF-49) para obtener la matriz de
   distancias entre esas coordenadas y el punto de partida: la ubicación del captor al
   generar la ruta (API de geolocalización del navegador; si no se da permiso, no hay GPS o
   queda a más de 30 km de la sede, no se usa) o, en su defecto, la sede de la Dirección
   General de Parques y Paseos, Mariano Moreno 2350 (ver `alcance.md` §2.5). Las solicitudes sin
   coordenadas (geocodificación fallida) quedan fuera del cálculo hasta corregirse.
4. **Orden de visita (RF-48):** una vez seleccionadas las solicitudes, se resuelve el orden
   de recorrido con la misma heurística de vecino más próximo sobre la matriz de
   distancias ya calculada, desde el punto de partida y sin tramo de regreso.
5. **Si OpenRouteService no responde:** la selección continúa usando solo el criterio de
   antigüedad (sin el desempate por distancia), y el orden de visita queda sin optimizar
   hasta que el servicio vuelva a responder — ver `slicing.md`, Parte B, segunda fila de la
   tabla de excepciones.

---

## 6. Almacenamiento offline (HU-09, HU-10)

- **Service Worker (Workbox):** cachea los assets estáticos de la PWA para que la app
  cargue sin conexión.
- **IndexedDB (Dexie.js):** guarda la cola de dictámenes y fotografías firmados sin
  conexión, en estado `pendiente_sincronizar`, cifrados con AES-GCM (ver sección 4).
- **Sincronización:** un listener de `online`/`offline` del navegador dispara el envío de
  la cola apenas se detecta conexión (RF-33), sin intervención del usuario.

---

## 7. Manejo de errores y casos de falla

_Catálogo de los puntos de falla más relevantes del sistema y cómo se resuelve cada uno.
Varios ya están decididos en otras secciones de este documento o en los `.md` de cátedra —
acá se los junta en un solo lugar, con los que todavía no tenían una resolución explícita.
El objetivo es que quien construya el sistema no tenga que adivinar qué hacer frente a cada
escenario de falla._

### 7.1 Autenticación y sesión

| Escenario | Qué hace el sistema |
|---|---|
| El JWT (30 min) vence a mitad de un formulario largo (dictamen, 5 pasos). | El cliente renueva el JWT en segundo plano con el refresh token mientras haya actividad, sin interrumpir al usuario. Si el refresh token también venció (tope de 7 días, RNF-20), recién ahí se pide reautenticar, y los datos ya cargados en el formulario se conservan (no se pierden al volver a loguearse). |
| Se revoca el captor de un ingeniero (RF-52) mientras tiene una sesión activa en ese dispositivo. | La revocación invalida el refresh token de inmediato en el servidor. La próxima petición de ese dispositivo (no hay que esperar a que venza el JWT de 30 min) es rechazada y el cliente muestra "sesión finalizada por un administrador", sin reintentar silenciosamente. |
| La sesión se cierra por inactividad (30 min) y el captor no tiene señal. | Tras cada ingreso exitoso con conexión, el captor guarda cifrado (AES-GCM, RNF-16) un verificador de la contraseña (bcrypt) y la fecha de ese ingreso. Sin señal, la app deja reanudar la sesión con la contraseña solo si el último ingreso con conexión fue ese mismo día, no pasaron 7 días desde el primer ingreso (RNF-20) y el captor no figura como revocado en su último estado conocido; los intentos fallidos suman para el bloqueo local de 5 (RF-52). Al volver la señal, `POST /auth/revalidar` confirma que el usuario siga vigente; si no lo está, se cierra la sesión (los dictámenes ya firmados en la cola se conservan y se sincronizan igual). (RF-57) |
| Un captor se bloquea por 5 intentos fallidos. | La pantalla de bloqueo muestra un código corto derivado del UUID del dispositivo. El Administrador lo ingresa en Gestión de usuarios, confirma y el servidor marca el dispositivo como desbloqueado y registra el evento en `RegistroAuditoria` en la misma transacción. El captor aplica el desbloqueo la próxima vez que consulta al servidor con conexión. (RF-60) |
| Falla la verificación WebAuthn al firmar, o el usuario la cancela. | Ya resuelto: el dictamen vuelve al Paso 5 con los datos intactos, sin firmar (ver CU-06, excepción, y wireframe `04b-segundo-factor.svg`). |

### 7.2 Conectividad y sincronización offline

| Escenario | Qué hace el sistema |
|---|---|
| Falla el guardado local de un dictamen firmado sin conexión. | Ya resuelto: estado de error visual con reintento manual (ver wireframe `04c-error-guardado-offline.svg`, caso de borde de HU-09). |
| Se pierde la conexión justo después de que el servidor recibe un dictamen de la cola offline, antes de que la confirmación (ACK) llegue al dispositivo. | Cada dictamen firmado localmente lleva un UUID generado en el dispositivo al momento de la firma. `/sync/dictamenes` usa ese UUID como clave de idempotencia: si el mismo UUID llega dos veces (por un reintento automático), el servidor no crea un segundo registro. |
| El mismo ingeniero sincroniza desde dos dispositivos distintos (perdió el celular, usa uno de respaldo). | El UUID por dictamen evita duplicados aunque las dos colas se sincronicen por separado. La organización de un solo captor activo por ingeniero es una política operativa, no una restricción técnica del sistema. |
| OpenRouteService no responde al generar una ruta. | Ya resuelto: selección solo por antigüedad, sin desempate por distancia, hasta que el servicio vuelva a responder (ver sección 5, punto 5). |
| Falla la geocodificación de una Solicitud al derivarse. | Ya resuelto: la Solicitud queda disponible para consulta y dictamen manual, pero sin coordenadas, excluida del cálculo de rutas hasta que un reintento automático (cada hora, RF-62) la geocodifique; nadie la corrige a mano (ver `er-modelo.md`, Decisión 9). |
| El mock de SUA / Autenticación Institucional no responde (en producción: el servicio real cae) durante el login. | El sistema muestra un mensaje propio —distinto del error genérico de credenciales (RF-50)— que informa que el servicio de autenticación no está disponible y que se intente nuevamente en un rato; la caída no cuenta como intento fallido (RF-52, RNF-19); no existe una copia cacheada de credenciales institucionales con la que loguear "igual" en ese momento. |

### 7.3 Concurrencia e integridad de datos

| Escenario | Qué hace el sistema |
|---|---|
| Dos ingenieros generan ruta casi al mismo tiempo y compiten por las mismas solicitudes. | Ya resuelto: condición de carrera analizada en `slicing.md`, Parte B (fila 1 de la tabla de excepciones). Implementación: la consulta a OpenRouteService se hace sin bloquear; la elección final y la reserva se hacen de a un ingeniero por vez dentro de una transacción con un bloqueo de PostgreSQL (`pg_advisory_xact_lock`), que relee las reservas, descarta las ya tomadas y completa el cupo con la siguiente. El índice único parcial de `RutaSolicitud` queda como última defensa. Probado con 7 ingenieros a la vez (RNF-02): ningún conflicto y el 95 % de los pedidos por debajo de 200 ms. |
| Doble clic en "Confirmar ruta" o en el botón de firma del dictamen. | El botón se deshabilita apenas se registra el primer clic (UI optimista) y, del lado del servidor, la misma petición repetida no duplica nada gracias al UUID de idempotencia (igual mecanismo que en sincronización offline). |
| Dos ingenieros cargan, sin verse entre sí (uno de ellos sin conexión), un dictamen para el mismo ejemplar. | La validación de "no existe ya un dictamen activo" (RF-21) se re-chequea en el servidor al sincronizar, no solo en el cliente. Si hay conflicto, el segundo dictamen en llegar no se descarta silenciosamente: la Solicitud pasa a estado Pendiente-revisión para que un Jefe decida cuál dictamen prevalece (mismo estado que ya usa RF-09 a RF-13). El Jefe ve ambos dictámenes en el detalle del caso y elige uno: el elegido queda con `vigente = true`, el otro con `vigente = false` y se conserva en el historial (RF-59, CU-15). |
| Una solicitud de tormenta reservada en una ruta del Protocolo por tormenta se intenta tomar también desde una ruta normal. | No es posible: toda Solicitud solo puede tener una fila activa en `RutaSolicitud` a la vez (ver `er-modelo.md`), sin importar si la ruta que la reservó es normal o de tormenta. |

### 7.4 Archivos y documentos

| Escenario | Qué hace el sistema |
|---|---|
| Falla la subida de una fotografía durante la sincronización de un dictamen. | Las fotos viajan dentro del mismo pedido que el dictamen (uno por pedido, ver sección 9): o llega todo o no llega nada, y el dictamen no se marca `sincronizado` ni sale de la cola hasta que el servidor confirma. El reintento reenvía el dictamen completo y el UUID evita duplicarlo. |
| Una fotografía es demasiado pesada para el almacenamiento offline limitado del dispositivo. | Se comprime en el cliente antes de guardarla en IndexedDB (redimensionado vía `canvas`, apuntando a ~1-2 MB por foto) para no agotar la cuota de almacenamiento del navegador con unas pocas fotos de alta resolución. |
| Falla la generación del PDF de un dictamen (RF-26, CU-08). | El PDF se genera on-demand en cada descarga, no se pre-genera ni se guarda una sola copia: una falla puntual no deja al dictamen sin PDF disponible para siempre, el usuario simplemente reintenta la descarga. |

### 7.5 Reportes y auditoría

| Escenario | Qué hace el sistema |
|---|---|
| El Dashboard podría mostrar datos desactualizados si una Solicitud cambia de estado justo mientras alguien lo está mirando. | Los KPIs se calculan on-demand en cada consulta (`GET /dashboard`), no se cachean ni se recalculan por lote, así que no hay ventana de desincronización entre vistas. |
| El registro de auditoría de una acción administrativa (por ejemplo, un alta de usuario) falla, pero la acción principal ya se ejecutó. | La acción principal y su fila en `RegistroAuditoria` se ejecutan en una sola transacción de base de datos: si el registro de auditoría falla, toda la operación se revierte. Ninguna acción administrativa relevante queda sin su rastro (RF-54). |
| Un dictamen llega alterado al sincronizar (RF-53) o el SUA manda una solicitud con datos inválidos (RNF-18). | El servidor crea un registro `CasoRevision` (tipo, referencia, motivo, fecha) y no da el caso por válido. El Administrador lo ve en `GET /revision` (apartado "Para revisar"), que es de solo lectura: no hay acción de editar ni descartar sobre el caso. (RF-58) |

---

## 8. Configuración base de los captores (RNF-22)

_Esto **no se programa dentro de la PWA**: una aplicación web no puede apagar ni reiniciar un
equipo ni controlar el Wi-Fi o los datos móviles. Se resuelve configurando el dispositivo
como **dispositivo dedicado** (Android Enterprise, modo "lock task" / kiosco) y gestionándolo
con una herramienta de administración de dispositivos (MDM) gratuita u open source, por
ejemplo Headwind MDM. Es una especificación de aprovisionamiento para el CIL, que es quien
entrega y administra los captores (ver `alcance.md` §3)._

| Control | Cómo se logra | Límite conocido |
|---|---|---|
| Bloqueo de pantalla obligatorio con PIN o huella, sin opción "deslizar" ni "ninguno". | Política de contraseña de la MDM (complejidad y tiempo de bloqueo automático). | Ninguno relevante: es una política estándar. |
| No se puede apagar ni reiniciar sin autenticarse. | El menú de energía no se ofrece con el equipo bloqueado (en modo kiosco se deshabilita el menú de acciones globales). Al encender, el equipo arranca bloqueado y exige PIN o huella; con el cifrado de almacenamiento activo, los datos locales (RNF-16) siguen ilegibles sin esa credencial. | Un reinicio forzado por hardware (mantener el botón de encendido) no se puede impedir por software en ningún Android: la defensa es que el equipo vuelve a arrancar bloqueado y cifrado, y que la MDM registra el evento. |
| No se puede desactivar Wi-Fi, datos móviles ni modo avión sin autenticarse. | Restricciones de usuario aplicadas por la MDM (`DISALLOW_CONFIG_WIFI`, `DISALLOW_CONFIG_MOBILE_NETWORKS`, `DISALLOW_AIRPLANE_MODE`) y panel de ajustes rápidos oculto en modo kiosco. | Apagar la conexión también impide la sincronización (RF-33); los dictámenes siguen guardándose cifrados localmente (RF-31, RNF-16) hasta que vuelva la conexión. |
| Sin modo seguro, sin restablecimiento de fábrica ni cuentas de usuario extra. | `DISALLOW_SAFE_BOOT`, `DISALLOW_FACTORY_RESET`, `DISALLOW_ADD_USER`. | Los nombres son los de la API de Android; validarlos contra la versión de Android del captor real. |
| Solo el sistema (y lo mínimo necesario) en pantalla. | Modo kiosco: la PWA instalada es la única aplicación accesible. | Requiere que el captor sea un equipo gestionable (no un celular personal). |

**Decisión abierta para el CIL:** la redacción de RNF-22 permite que el ingeniero, una vez
autenticado con su PIN o huella, apague el equipo o cambie la conectividad. Una versión más
estricta —nadie puede cambiarlo, ni autenticado, salvo desde la consola de la MDM— cierra el
caso de un ingeniero que corta la conexión a propósito, pero impide cosas legítimas como
activar el modo avión en un vuelo. Se dejó la versión literal; cambiarla es una decisión de
política, no técnica.

**Relación con los riesgos:** esta configuración es la base para mitigar R-02 (pérdida o
robo del captor) en el trabajo de Seguridad de los Sistemas: un captor que no se puede
apagar ni dejar sin conexión sin credencial es un captor que la MDM puede bloquear o borrar
a distancia.

---

## 9. Operación y disponibilidad (RNF-01, RNF-04, RNF-10, RNF-11)

- **Timeout de red (RNF-04):** toda solicitud HTTP de la PWA corta a los **10 segundos**; si
  no hubo respuesta, se trata como falla de red y el dictamen sigue el camino offline
  (guardado cifrado local y reintento con espera creciente, RNF-17). Para que un dictamen
  con sus fotos entre en ese tiempo aun con señal débil, la cola se sincroniza de a un
  dictamen por pedido. Del lado del servidor, la consulta a OpenRouteService corta a los 6
  segundos y la ruta se ordena solo por antigüedad (sección 5, punto 5), así generar una
  ruta siempre responde antes del límite del cliente.
- **Backup y retención (RNF-10, RNF-11):** en producción, la frecuencia de los backups y el
  lugar donde se guardan los define el **CIL**, que administra la infraestructura real. En la
  demo, un servicio de `docker-compose.prod.yml` hace todos los días un `pg_dump` de la base
  (se conservan 14 días) y una copia de las fotografías (7 días) en el servidor; conviene
  bajarlas a otro equipo de vez en cuando (ver `sistema/DESPLIEGUE.md`).
- **Disponibilidad 24/7 (RNF-01):** el requisito no cambia. La **demo** corre en una máquina
  virtual gratuita que no se duerme y se levanta sola si se reinicia, pero se ofrece en el
  mejor esfuerzo: Oracle puede recuperar una máquina gratuita que pasa 7 días casi sin uso.
  El 24/7 real depende del hosting institucional del CIL en producción.

---

## 10. Vacíos cerrados por este documento

| Vacío identificado en la revisión | Resuelto en |
|---|---|
| Stack tecnológico no definido | Sección 1 |
| Sin contrato de API interno | Sección 2 |
| Esquemas de las bases simuladas de la demo | Sección 3 |
| Algoritmo/hash de firma y de contraseñas sin especificar | Sección 4 |
| Mecanismo concreto del segundo factor (RF-51) | Sección 4 |
| Servicio de mapas sin nombrar (RNF-14) | Secciones 1 y 5 |
| Métrica de "eficiencia" sin definir (RF-47, pendiente del DoR) | Sección 5 |
| Tecnología de almacenamiento offline sin decidir (HU-09) | Sección 6 |
| Rate-limiting server-side, tope de sesión, cabeceras HTTP, borrado post-sync | Sección 4 |
| Manejo de errores y casos de falla no catalogado | Sección 7 |
| Decisiones de producto cerradas con el equipo: distrito como filtro de ruta, qué datos van al SUA, "Para revisar", dictámenes duplicados, desbloqueo de captor, sesión sin señal, "Sin trabajo", solicitudes sin ubicar | Secciones 2, 7.1, 7.2, 7.3 (RF-15, RF-24, RF-57 a RF-62) |
| Configuración base de los captores (apagado, reinicio, conectividad) | Sección 8 |
| Timeout de red sin valor concreto (RNF-04) | Sección 9 (10 segundos) |
| Frecuencia de backup indefinida (RNF-11) | Sección 9 (la define el CIL) |
| 24/7 incompatible con hosting gratuito de la demo (RNF-01) | Sección 9 (demo en mejor esfuerzo; producción por CIL) |

**Lo que sigue sin poder cerrarse acá** (depende de terceros): el esquema real de campos del SUA y de la Autenticación
Institucional, y la confirmación del indicador de re-derivación — ambos requieren
validación directa con el CIL y el equipo del SUA, no son una decisión de este equipo.
