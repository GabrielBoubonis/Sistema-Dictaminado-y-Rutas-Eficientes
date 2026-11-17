# Decisiones técnicas: por qué elegimos lo que elegimos

_Este documento no forma parte de las plantillas de la cátedra. Defiende cada decisión
técnica del sistema: qué elegimos, qué alternativas comparamos y por qué las descartamos.
El detalle de cómo está construido cada punto vive en `arquitectura-tecnica.md`; el
resumen de tecnologías y del alojamiento, en `resumen-tecnologico.md`._

---

## Criterios con los que comparamos

Todas las alternativas se midieron contra los mismos criterios, que salen del problema y
del organismo comitente.

| Criterio | Por qué importa |
|---|---|
| Gratuito y de código abierto | Es un organismo público: sin licencias ni costos por uso (requisito del proyecto). |
| Funciona sin señal | El ingeniero dictamina en la vereda, muchas veces sin datos móviles (RF-31 a RF-33). |
| Corre en el celular que ya existe | Los captores son Android que provee la Dirección; no se compra hardware. |
| Prueba quién firmó | El dictamen es un documento con valor administrativo (RF-22, RF-51). |
| Mantenible por un equipo chico | Un solo lenguaje y herramientas conocidas reducen el costo de mantenerlo. |

---

## 1. Tipo de aplicación: aplicación web progresiva (PWA)

**Elegimos** una PWA: una página web que se instala en el celular como una app, funciona
sin conexión gracias a un service worker y se actualiza sola al publicar una versión nueva.

| Alternativa | Por qué no |
|---|---|
| App nativa Android (Kotlin) | Un código aparte para la app y otro para la web del Jefe y del Administrador; distribución por Play Store o instalación manual. |
| React Native o Flutter | Una sola base de código, pero igual hay que publicar en una tienda y mantener otra cadena de compilación. |
| Sitio web común | No funciona sin señal: el ingeniero perdería el dictamen en la vereda. |

**Lo que resignamos:** menos acceso al hardware que una app nativa. No hizo falta: la
cámara, el GPS y el sensor de huella están disponibles desde el navegador.

---

## 2. Interfaz: React + Vite + TypeScript

**Elegimos** React 18 con Vite 5 y TypeScript.

| Alternativa | Por qué no |
|---|---|
| Angular | Más estructura de la que necesita una app de este tamaño; curva más larga. |
| Vue o Svelte | Igual de válidos; React tiene más bibliotecas y más material para el equipo. |
| Next.js | Su fuerte es el renderizado en servidor, que no aporta en una app que tiene que andar sin conexión. |

Vite compila rápido y tiene el complemento oficial de PWA (`vite-plugin-pwa`, sobre
Workbox de Google), que genera el service worker sin escribirlo a mano. TypeScript
detecta errores de tipos entre la app y el servidor antes de ejecutar.

---

## 3. Servidor: Node.js + Express + TypeScript

**Elegimos** Node.js con Express y TypeScript: **el mismo lenguaje en el celular y en el
servidor**. Esto no es solo comodidad: el cálculo del hash de la firma tiene que dar
idéntico en los dos lados (ver punto 6), y con un solo lenguaje se comparte la misma regla
y un vector de prueba común.

| Alternativa | Por qué no |
|---|---|
| Java + Spring Boot | Robusto, pero más pesado y en otro lenguaje que la app: la regla de la firma quedaría escrita dos veces. |
| Python + Django | Mismo problema de dos lenguajes; Django trae un panel y plantillas que no usamos. |
| PHP + Laravel | Ídem; además su modelo de ejecución encaja peor con trabajos en segundo plano (reintentos al SUA). |

---

## 4. Base de datos: PostgreSQL 16

**Elegimos** PostgreSQL porque resuelve en la base cosas que de otro modo habría que
programar y probar a mano:

- **Índice único parcial:** una solicitud no puede estar reservada en dos rutas activas a
  la vez, aunque dos pedidos lleguen al mismo milisegundo (RF-16).
- **Bloqueo asesor de transacción** (`pg_advisory_xact_lock`): las reservas de ruta se
  hacen de a una, sin frenar el cálculo de distancias (probado con 7 ingenieros a la vez).
- **Trigger:** el registro de auditoría no se puede modificar ni borrar, ni siquiera por
  error desde la aplicación (RF-54).
- **Claves compuestas y JSONB:** el número de SUA + año como identificador, y el
  recorrido de la ruta guardado tal cual.

| Alternativa | Por qué no |
|---|---|
| MySQL o MariaDB | No tiene índices únicos parciales; habría que simularlos. |
| MongoDB | Sin integridad referencial entre solicitud, dictamen y ruta, que es el corazón del modelo. |
| SQLite | No soporta bien varios usuarios escribiendo a la vez en el servidor. |

---

## 5. Acceso a datos: Prisma + `init.sql`

**Elegimos** Prisma 7 porque genera los tipos de TypeScript a partir del esquema: si una
columna cambia, el código que la usa deja de compilar. Lo que Prisma no sabe expresar (el
trigger de auditoría, el índice parcial, las migraciones de datos) va en `init.sql`, un
script idempotente que se aplica solo cada vez que arranca el servidor.

| Alternativa | Por qué no |
|---|---|
| TypeORM o Sequelize | Tipos menos precisos y más configuración. |
| SQL a mano en todo | Sin chequeo de tipos: los errores aparecen recién al ejecutar. |

---

## 6. Integridad del dictamen: SHA-256 sobre JSON canónico

**Elegimos** calcular un hash SHA-256 de todo el contenido del dictamen (fotos incluidas)
en el momento de la firma, y recalcularlo en el servidor al recibirlo. Si alguien cambia
un solo carácter, el hash ya no coincide y el dictamen queda marcado para revisión
(RF-53).

Para que el hash del celular y el del servidor den igual, el dictamen se escribe primero
en **JSON canónico**: claves ordenadas y sin espacios. El mismo contenido produce siempre
el mismo texto, y por lo tanto el mismo hash.

| Alternativa | Por qué no |
|---|---|
| MD5 o SHA-1 | Están rotos: se pueden fabricar dos contenidos distintos con el mismo hash. No sirven para integridad. |
| SHA-3 o BLAKE3 | Seguros, pero no vienen en la Web Crypto API del navegador: habría que sumar una biblioteca y su mantenimiento. |
| SHA-512 | Igual de seguro, sin ventaja práctica acá; SHA-256 es el que usa WebAuthn y el más soportado. |
| HMAC con una clave del servidor | Necesita la clave en el celular, que es justamente el lugar menos seguro, y no funciona sin señal. |

**Clave de la decisión:** SHA-256 está incorporado en el navegador (Web Crypto) y en Node,
sin bibliotecas extra, y funciona sin conexión.

---

## 7. Identidad de quien firma: WebAuthn con la huella del celular

**Elegimos** WebAuthn, el estándar abierto del W3C detrás de las llaves de acceso
(passkeys). Al registrar la huella, el sensor del celular crea un par de claves: **la
clave privada nunca sale del teléfono** y el servidor guarda solo la pública. Al firmar,
el celular pide la huella y firma **el hash del dictamen** (punto 6) con esa clave. El
servidor verifica la firma con la clave pública del ingeniero.

Así se prueban tres cosas a la vez: que el contenido es exactamente ese, que lo firmó el
celular de ese ingeniero y que lo hizo él (la huella es obligatoria:
`userVerification: required`). Como lo que se firma es el hash, funciona **sin señal**: la
verificación se hace cuando el dictamen llega al servidor.

| Alternativa | Por qué no |
|---|---|
| Volver a pedir la contraseña | Se comparte o se anota; no prueba que firmó la persona. |
| Código por SMS o correo | Necesita señal en el momento de firmar, que es justo lo que falta en la calle. |
| PIN propio de la app | Mismo problema que la contraseña, y habría que guardarlo de forma segura. |
| Leer la huella "a mano" | El navegador no da acceso directo al sensor; WebAuthn es la vía estándar y segura. |
| Firma digital con certificado (token o certificado de la Autoridad Certificante) | Costo por ingeniero, trámite, un dispositivo extra y no funciona sin conexión en el celular. Queda como evolución posible (ver al final). |

**Biblioteca:** SimpleWebAuthn (código abierto), del lado del navegador y del servidor.

---

## 8. Sesión: JWT corto + token de renovación

**Elegimos** un JWT de 30 minutos (firmado con HS256) más un token de renovación con tope
de 7 días, guardado en la base solo como hash y revocable (RF-04, RF-05, RNF-20).

| Alternativa | Por qué no |
|---|---|
| Sesión en el servidor con cookie | Válida, pero acopla cada pedido a la memoria del servidor y complica reanudar sin señal. |
| JWT largo sin renovación | Si se roba, sirve por días y no se puede cortar. |

---

## 9. Contraseñas: bcrypt (costo 12)

**Elegimos** bcrypt, con costo 12, en su versión `bcryptjs` (JavaScript puro).

| Alternativa | Por qué no |
|---|---|
| SHA-256 directo | Es rápido a propósito, y eso es malo para contraseñas: se pueden probar millones por segundo. |
| Argon2 | Técnicamente mejor, pero su versión para Node necesita compilar código nativo, que complica la imagen para el servidor ARM. bcrypt sigue siendo seguro con un costo adecuado. |

Además hay dos capas contra el que prueba contraseñas: el servidor limita los intentos
(10 cada 15 minutos por IP y usuario, RNF-19) y el captor se bloquea a los 5 seguidos
(RF-52).

---

## 10. Datos en el celular: IndexedDB + AES-GCM

**Elegimos** IndexedDB (con la biblioteca Dexie) para guardar los dictámenes firmados sin
señal, sus fotos y los borradores, **cifrados con AES-GCM de 256 bits**. La clave se crea
en el celular como **no exportable**: ni siquiera el código de la app puede leerla, solo
usarla. Al confirmarse la sincronización, la copia local se borra (RNF-16).

| Alternativa | Por qué no |
|---|---|
| localStorage | Unos 5 MB, solo texto y sin cifrar: no entran las fotos y quedan a la vista. |
| AES-CBC u otro modo | No detecta si el dato cifrado fue alterado; GCM sí (cifrado autenticado). |

Para reanudar la sesión sin señal (RF-57) el celular no guarda la contraseña: guarda un
verificador derivado con PBKDF2 (150.000 iteraciones, SHA-256), que también viene en el
navegador.

---

## 11. Mapas: Leaflet + OpenStreetMap

**Elegimos** Leaflet con las teselas de OpenStreetMap, que se guardan en caché para verlas
sin señal.

| Alternativa | Por qué no |
|---|---|
| Google Maps | Pide clave con facturación habilitada; se cobra pasado el cupo gratuito. |
| Mapbox | Mismo esquema: gratis hasta un cupo, después pago. |

---

## 12. Rutas: OpenRouteService + vecino más próximo

**Elegimos** OpenRouteService (plan gratuito, con clave) para las distancias reales a pie
y en vehículo y para el recorrido por calles, y una heurística de **vecino más próximo**
para ordenar las paradas, siempre después de priorizar por antigüedad (RF-47, RF-48).

| Alternativa | Por qué no |
|---|---|
| Google Distance Matrix y Directions | Pagos. |
| OSRM o GraphHopper instalados en el servidor | Gratuitos, pero procesar el mapa necesita bastante memoria en la misma VM gratuita (OSRM, además, un servicio por cada modo: a pie y en auto). Quedan como alternativa si se supera el cupo. |
| Orden exacto (problema del viajante) | Con decenas de paradas no se resuelve exacto dentro de los 10 segundos que exige RNF-04. El vecino más próximo da una ruta buena al instante. |

Si OpenRouteService no responde, la ruta igual se arma, ordenada solo por antigüedad, y
el mapa lo avisa.

---

## 13. Ubicación de las direcciones: Georef + Nominatim

**Elegimos** Georef, la API gratuita del Estado nacional, que ubica por altura exacta con
los tramos de calle del INDEC; si no encuentra la dirección, se usa Nominatim
(OpenStreetMap). Las coordenadas se calculan una sola vez, al llegar la solicitud.

| Alternativa | Por qué no |
|---|---|
| Solo Nominatim | OpenStreetMap no tiene cargadas las alturas de varias avenidas de Rosario. |
| Google Geocoding | Pago. |

---

## 14. Validación y listas cerradas: zod

**Elegimos** zod para validar en el servidor cada dato que llega, con las mismas listas
cerradas que muestra el formulario (`catalogos.json`). Aunque alguien mande datos por fuera
de la app, el servidor rechaza lo que no corresponde (RF-56). El análisis del reporte real
de la Dirección (la misma medida escrita de 441 maneras) justifica esta rigidez.

---

## 15. PDF del dictamen: PDFKit

**Elegimos** PDFKit, que arma el PDF en el servidor con el contenido firmado (RF-26).

| Alternativa | Por qué no |
|---|---|
| Navegador sin pantalla (Puppeteer) | Pesa cientos de MB y consume mucha memoria en una VM gratuita. |
| Generarlo en el celular | El documento legal tiene que salir de lo que guardó el servidor, no de lo que muestra un celular. |

---

## 16. Pruebas: base de datos real, no simulada

**Elegimos** Jest + supertest contra **PostgreSQL real**, porque las reglas más delicadas
(reservas simultáneas, auditoría inmutable, índices) viven en la base y una base simulada
no las probaría. En la app, Vitest con una IndexedDB simulada; de punta a punta, Playwright
con un navegador real. Hoy son 101 pruebas automáticas (86 del servidor y 15 de la app),
incluida una de carga con 7 ingenieros a la vez.

---

## 17. Alojamiento: Docker + Caddy en Oracle Cloud Always Free

**Elegimos** empaquetar todo con Docker Compose y publicarlo en una máquina virtual
gratuita de Oracle Cloud, con Caddy delante para el HTTPS automático (Let's Encrypt) y un
nombre gratuito de DuckDNS. El detalle está en `resumen-tecnologico.md`.

| Alternativa | Por qué no (evaluado en octubre de 2026) |
|---|---|
| Render | Se duerme a los 15 minutos sin uso, la base gratuita vence a los 30 días y no tiene disco para las fotos. |
| Fly.io, Railway, Koyeb | Sin plan gratuito real para una base y un servidor permanentes. |
| Vercel | No corre un servidor permanente con base de datos. |
| Nginx + Certbot | Funciona, pero hay que configurar y renovar el certificado a mano; Caddy lo hace solo. |

El HTTPS no es opcional: WebAuthn y la instalación de la PWA solo funcionan con HTTPS.

---

## 18. Interfaz accesible para la calle

**Elegimos** un estilo de alto contraste sobre fondo blanco (se lee al sol), la letra
Atkinson Hyperlegible (diseñada para máxima legibilidad), íconos Lucide en lugar de emojis
(se ven igual en todos los celulares) y botones de al menos 44 px (se tocan con guantes).
Los colores de los gráficos se eligieron con un validador para daltonismo. Las dos
bibliotecas vienen dentro de la app, así que también funcionan sin señal.

---

## Lo que sabemos que se puede mejorar

Defender una decisión también es conocer sus límites.

| Tema | Límite actual | Cómo se evolucionaría |
|---|---|---|
| Valor legal de la firma | Es una **firma electrónica** (Ley 25.506): prueba identidad e integridad, pero no es "firma digital" con certificado de un certificador licenciado. | Sumar firma digital con certificado cuando la Municipalidad lo provea. |
| Huella atada al celular | Si se cambia el celular, el ingeniero vuelve a registrar su huella. | Es el comportamiento esperado de WebAuthn; el Administrador revoca el captor viejo. |
| Cupo de OpenRouteService | 2.000 pedidos por día en el plan gratuito. | Instalar OSRM propio si el uso real lo supera. |
| Orden de la ruta | Vecino más próximo: buena, no óptima. | Agregar una mejora local (2-opt) si hiciera falta. |
| Un solo servidor | Sin réplica: si la VM cae, la demo cae (los dictámenes sin señal esperan en el celular). | Réplica de la base y un segundo servidor en un despliegue real. |
| SUA y autenticación institucional | Simulados: no hay acceso a los servicios reales de la Municipalidad. | Reemplazar los adaptadores (`IReclamoProvider`, `IAuthProvider`) por los reales. |
