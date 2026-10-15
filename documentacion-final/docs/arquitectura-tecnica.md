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
| ORM | Prisma | Gratuito, genera tipos TypeScript desde el esquema, simplifica traducir `er-modelo.md` a migraciones SQL. |
| Frontend | React + Vite | Gratuito, ecosistema grande, Vite da un build rápido y soporte nativo para PWA vía plugin. |
| PWA / offline | Workbox (Service Worker) + Dexie.js (IndexedDB) | Ambos gratuitos/OSS. Workbox cachea los assets de la app; Dexie maneja la cola de dictámenes/fotos "pendiente de sincronizar" (RF-31 a RF-34) con una API más simple que IndexedDB nativo. |
| Autenticación | JWT (librería `jsonwebtoken`) + bcrypt + WebAuthn (`@simplewebauthn/server` y `/browser`) | Las tres son gratuitas/OSS. WebAuthn resuelve RF-51 usando el sensor biométrico que ya tienen los captores Android, sin depender de SMS/email. |
| Mapas y ruteo | OpenRouteService (API gratuita, límite ~2000 requests/día en el tier free) + Leaflet (mapa interactivo, OSS) | Cubre RNF-14: cálculo de distancia/tiempo a pie y en vehículo, y dibujo de zona en el mapa (RF-15) sin costo. |
| Rate limiting | `express-rate-limit` | Gratuito/OSS, cubre RNF-19. |
| Testing | Jest (backend) + Vitest (frontend) | Ambos gratuitos/OSS, estándar en el ecosistema Node/React. |
| Hosting de la demo (opcional) | Render / Railway (backend, capa free) + Vercel o Netlify (frontend, capa free) + Neon/Supabase (Postgres, capa free) | Ninguno tiene costo para el volumen de una demo académica; para producción real, el CIL define el hosting institucional (fuera de este alcance, ver `alcance.md` §3). |

**Fuera de esta elección (y por qué):** no se propone GraphQL (REST alcanza para la
cantidad de recursos del sistema, y es más simple de documentar con OpenAPI) ni un
framework de backend más pesado (NestJS, etc. — Express es suficiente para el tamaño de
este proyecto y reduce la curva de entrada).

---

## 2. Contrato de API interno (resumen)

API REST, JSON, autenticación por JWT en el header `Authorization: Bearer <token>` salvo en
`/auth/login`. Agrupado por módulo de `requisitos.md`:

| Recurso | Endpoints principales | RF relacionados |
|---|---|---|
| `/auth` | `POST /auth/login` (paso 1 y 2, RF-01 a RF-03), `POST /auth/refresh`, `POST /auth/logout`, `POST /auth/webauthn/verify` (segundo factor, RF-51), `POST /auth/revalidar` (al volver la conexión tras reanudar sin señal, RF-57) | RF-01 a RF-05, RF-50, RF-51, RF-57 |
| `/usuarios` | `GET /usuarios`, `POST /usuarios`, `PATCH /usuarios/:id`, `POST /usuarios/:id/reset-password`, `POST /usuarios/:id/revocar-captor`, `GET /usuarios/captores-bloqueados?codigo=`, `POST /usuarios/captores/:codigo/desbloquear` | RF-06 a RF-08, RF-52, RF-60 |
| `/solicitudes` | `GET /solicitudes` (filtros de estado/distrito), `GET /solicitudes/:numeroSua/:anio` | RF-09 a RF-13 |
| `/rutas` | `POST /rutas` (generar, RF-14 a RF-19, RF-47 a RF-49), `GET /rutas/activa`, `POST /rutas/:id/restablecer` | RF-14 a RF-19, RF-47 a RF-49 |
| `/dictamenes` | `POST /dictamenes` (completar y firmar, dispara WebAuthn), `GET /dictamenes/:numeroSua/:anio/historial`, `GET /dictamenes/:id/pdf`, `GET /dictamenes/:numeroSua/:anio/conflicto` y `POST /dictamenes/:id/vigente` (solo Jefe, RF-59) | RF-20 a RF-29, RF-45, RF-46, RF-51, RF-59, RF-61 |
| `/sync` | `POST /sync/dictamenes` (cola offline → servidor, recalcula hash, RF-53) | RF-30 a RF-34, RF-53 |
| `/especies` | `GET /especies?q=` (búsqueda para el selector), `POST /especies` (agregar una especie nueva, normalizada y sin duplicados) | RF-56 |
| `/dashboard` | `GET /dashboard?mes=&anio=` | RF-35 a RF-37, RF-44 |
| `/tormenta` | `GET /tormenta`, `POST /tormenta/rutas` | RF-38 a RF-43 |
| `/auditoria` | `GET /auditoria?usuario=&accion=&desde=&hasta=` | RF-54, RF-55 |
| `/revision` | `GET /revision` (apartado "Para revisar", solo Administrador, solo lectura) | RF-58, RNF-18 |

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

---

## 4. Mecanismos de seguridad (detalle de implementación)

| Mecanismo | Elección concreta | RF/RNF que resuelve |
|---|---|---|
| Hash de firma del dictamen | SHA-256 sobre el JSON canónico del dictamen (campos ordenados, sin espacios) | RF-22, RF-53 |
| Hashing de contraseñas | bcrypt, costo 12 | RNF-05 |
| Segundo factor al firmar | WebAuthn (biometría del dispositivo); ver wireframe `04b-segundo-factor.svg` | RF-51 |
| Cifrado at-rest en el captor | AES-GCM (Web Crypto API), clave derivada de la sesión activa | RNF-16 |
| Borrado post-sincronización | al confirmarse la sincronización (RF-33), se eliminan de IndexedDB la fotografía y el dictamen ya enviados | RNF-16 |
| Rate limiting server-side | 10 intentos fallidos / 15 min por combinación IP + usuario (también para usuarios inexistentes), backoff exponencial; capa distinta del bloqueo local a los 5 intentos del captor | RNF-19, RF-52 |
| Validación de campos cerrados | el servidor valida cada campo de lista cerrada contra su enumeración o tabla de catálogo y responde 422 ante cualquier valor fuera de ella | RF-56 |
| Sesión | JWT corto (30 min) + refresh token con tope absoluto de 7 días | RF-04, RF-05, RNF-20 |
| Cabeceras HTTP | CSP `default-src 'self'`, HSTS, `X-Frame-Options: DENY` en todas las respuestas | RNF-21 |

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
   cacheadas (geocodificadas una sola vez al momento de la derivación, vía la API de
   Geocoding de OpenRouteService — ver `er-modelo.md`, Decisión 9), así que generar una
   ruta no geocodifica de nuevo. Se consulta la API de Matrix de OpenRouteService (perfil
   `foot-walking` o `driving-car` según el modo elegido, RF-49) para obtener la matriz de
   distancias entre esas coordenadas y la sede de la Dirección General de Parques y Paseos
   (punto de partida y cierre del cálculo, ver `alcance.md` §2.5). Las solicitudes sin
   coordenadas (geocodificación fallida) quedan fuera del cálculo hasta corregirse.
4. **Orden de visita (RF-48):** una vez seleccionadas las solicitudes, se resuelve el orden
   de recorrido con la misma heurística de vecino más próximo sobre la matriz de
   distancias ya calculada, partiendo de la sede.
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
| Dos ingenieros generan ruta casi al mismo tiempo y compiten por las mismas solicitudes. | Ya resuelto: condición de carrera analizada en `slicing.md`, Parte B (fila 1 de la tabla de excepciones). |
| Doble clic en "Confirmar ruta" o en el botón de firma del dictamen. | El botón se deshabilita apenas se registra el primer clic (UI optimista) y, del lado del servidor, la misma petición repetida no duplica nada gracias al UUID de idempotencia (igual mecanismo que en sincronización offline). |
| Dos ingenieros cargan, sin verse entre sí (uno de ellos sin conexión), un dictamen para el mismo ejemplar. | La validación de "no existe ya un dictamen activo" (RF-21) se re-chequea en el servidor al sincronizar, no solo en el cliente. Si hay conflicto, el segundo dictamen en llegar no se descarta silenciosamente: la Solicitud pasa a estado Pendiente-revisión para que un Jefe decida cuál dictamen prevalece (mismo estado que ya usa RF-09 a RF-13). El Jefe ve ambos dictámenes en el detalle del caso y elige uno: el elegido queda con `vigente = true`, el otro con `vigente = false` y se conserva en el historial (RF-59, CU-15). |
| Una solicitud de tormenta reservada en una ruta del Protocolo por tormenta se intenta tomar también desde una ruta normal. | No es posible: toda Solicitud solo puede tener una fila activa en `RutaSolicitud` a la vez (ver `er-modelo.md`), sin importar si la ruta que la reservó es normal o de tormenta. |

### 7.4 Archivos y documentos

| Escenario | Qué hace el sistema |
|---|---|
| Falla la subida de una fotografía durante la sincronización de un dictamen (las demás fotos y los datos del dictamen sí llegan). | El dictamen no se marca `sincronizado` hasta que todas sus fotos lleguen con éxito. En el próximo intento de sync solo se reintenta la foto faltante, no el dictamen completo. |
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
  (guardado cifrado local y reintento con espera creciente, RNF-17).
- **Backup y retención (RNF-10, RNF-11):** la frecuencia de los backups y el lugar donde se
  guardan los define el **CIL**, que administra la infraestructura real. Para la demo alcanza
  con un `pg_dump` manual u opcional; no se fija un valor en este documento.
- **Disponibilidad 24/7 (RNF-01):** el requisito no cambia. Se aclara que la **demo** se
  ofrece en el mejor esfuerzo, porque los planes gratuitos de hosting (Render, Neon, Supabase)
  pueden pausar el servicio por inactividad; el 24/7 real depende del hosting institucional
  del CIL en producción.

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
