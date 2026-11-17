# Registro de cambios

Cambios hechos al sistema y a la documentación, del más nuevo al más viejo.

---

## 16/11/2026 — Dashboard nuevo, sección de dictaminados y sin elección del Jefe

### Ya no elige el Jefe entre dos dictámenes (RF-59)

- Antes: si dos ingenieros dictaminaban el mismo caso (uno sin señal), la solicitud quedaba
  en "Pendiente-revisión" hasta que un Jefe elegía cuál valía.
- Ahora: queda vigente el **primero que llegó** al servidor (como elegiste). El segundo no se
  pierde: queda en el historial del caso como no vigente, con su PDF, y no se envía al SUA.
  Al ingeniero que lo firmó la app le muestra un aviso. La solicitud queda Dictaminada.
- Se borraron la pantalla de elección, sus dos rutas de la API y el estado "pendiente de
  elección". Los casos que hubiera en la base con la regla vieja se resuelven solos con la
  regla nueva al arrancar el servidor (`init.sql`).
- Documentación: RF-59 reescrito; el caso de uso CU-15 y la historia HU-17 (que eran la
  elección del Jefe) ahora describen la sección de dictaminados; pantalla 11 de
  `diseño-ui.md` con wireframe nuevo (`11-dictaminados.svg`, se borró
  `11-conflicto-dictamenes.svg`); `alcance.md`, `casos-de-uso.md` (CU-10 E5, actores),
  `er-modelo.md`, `arquitectura-tecnica.md` y los diagramas de actividad, estados y casos
  de uso.

### Sección de dictaminados con descarga del PDF (RF-64, nuevo)

- Operador y Jefe: pestaña "Dictaminadas" arriba, en Solicitudes. Lector y Administrador:
  sección "Dictaminados" en el menú (no ven Solicitudes). Misma lista para todos.
- Cada caso muestra dirección, distrito, especie, resultado, quién lo firmó y cuándo, con
  un botón "Descargar PDF" (el del dictamen vigente). Búsqueda por dirección, N.° de SUA o
  ingeniero, y filtro por distrito. Necesita conexión.
- En el detalle de una solicitud, cada dictamen del historial tiene "Ver PDF" y "Descargar".

### Dashboard nuevo

- Cuatro indicadores (derivadas, dictaminadas, sin dictaminar, avance con barra), un bloque
  aparte para tormenta y gráficos por mes, distrito y prioridad, con leyenda, valores
  escritos, cartel al pasar el dedo o el mouse y "Ver como tabla".
- Colores elegidos con el skill dataviz y su validador: dictaminadas en verde y sin
  dictaminar en azul. Probé verde y naranja, pero no pasa para daltonismo rojo-verde.
- Los gráficos se dibujan al ancho real de la pantalla, así el texto se lee igual en el
  celular y en la computadora. Wireframe `05-dashboard.svg` actualizado.

### Verificado y pendiente

- Verificado: 86 tests de backend y 15 de frontend; la PWA compila; capturas del dashboard
  (celular y escritorio), de la pestaña Dictaminadas y de la sección del Lector.
- **No verificado**: en un celular real ni en el servidor.

---

## 16/11/2026 — Plantar solo con extracción y rediseño visual

### Plantar otro árbol solo si se extrae el existente

- "Plantar" pasó al paso 2, dentro del bloque Extracción, como "Plantar otro árbol en su
  lugar" (opcional). Solo aparece si se marca Extracción; al desmarcarla se borra.
- El servidor rechaza un dictamen con Plantar y sin Extracción.
- El reporte real lo respalda: 610 de los 655 casos con Plantar tienen extracción. Los
  otros 45 (6 %) no; podrían ser errores de carga o árboles que ya no estaban.
- Archivos: `DictamenForm.tsx`, `lib/reglas.ts`, `services/dictamenes.ts`, tests y los
  dictámenes de prueba (solo el del conflicto con extracción conserva Plantar).
- Documentación: `dictamen-tecnico-campos.md`, `er-modelo.md`, `er.puml`, `diseño-ui.md`.

### Rediseño con el skill ui-ux-pro-max

- Skill instalado en `.claude/skills/ui-ux-pro-max` (licencia MIT). Lo revisé antes de
  instalarlo: no usa internet ni ejecuta comandos; solo busca en sus propias tablas. Copié
  solo ese skill, sin sus tests (el repositorio original trae otros seis que no hacían falta).
- Estilo "accesible y sobrio": verde institucional sobre **fondo blanco** (como pediste, para
  la calle), texto casi negro, letra **Atkinson Hyperlegible** (incluida en la app, anda sin
  conexión), íconos **Lucide** en lugar de emojis, botones y casillas de al menos 44 px,
  foco visible, prioridad con color y texto ("Prioridad alta"), menú inferior con íconos.
- En el celular el encabezado muestra solo íconos (estado de sincronización y salir) para
  que no se corte; el texto sigue disponible para lectores de pantalla.
- Archivos: `styles.css` (reescrito con tokens de color), `App.tsx`, `main.tsx`,
  `vite.config.ts` (colores de la PWA y la letra en la caché sin conexión), `index.html` y
  las pantallas con emojis. Dependencias nuevas: `lucide-react` y
  `@fontsource/atkinson-hyperlegible` (gratis, de código abierto).

### Verificado y pendiente

- Verificado: 85 tests de backend y 15 de frontend, la PWA compila, y capturas en tamaño
  celular con Chrome sin ventana (ingreso, solicitudes, detalle, dictamen y tormenta).
- **No verificado**: en un celular real ni al sol.
- En tu PC, después de bajar el código, corré `npm run db:init` en `sistema/backend`: si
  no, la base de desarrollo no tiene las columnas nuevas y el detalle da error 500 (me pasó
  al probar). En el servidor no hace falta: se aplica solo al arrancar.

---

## 13/11/2026 — Formulario del dictamen alineado con el reporte real de la Dirección

### Por qué

Se sumó el reporte real de solicitudes de la Dirección (33.887 solicitudes, hoja "Base"
con todos los campos del dictamen). Comparándolo con el sistema aparecieron diferencias de
nombres, campos que faltaban y un error: la fecha del dictamen se podía cambiar.

### Qué cambió

| Tema | Antes | Ahora |
|---|---|---|
| Fecha del dictamen | Editable | Solo lectura: el día de la firma (hora de Argentina). El servidor rechaza otra fecha o una firma futura |
| Motivos de extracción | Sin código y con otra redacción | Códigos y redacción del reporte: "2.1 Árbol muerto" … "2.12 Cepa muerta" |
| Trabajos aéreos | Sin código; 4 nombres distintos | "4.1 Poda de formación" … "4.12 Eliminación de ramas peligrosas" (p. ej. "conductores aéreos", no "eléctricos") |
| Agrandamiento de cazuela | Opción de Plantar | Trabajo subterráneo, como en el reporte (decisión tuya) |
| Plantar | Cazuela, Construir cazuela, Vereda jardín, Agrandar cazuela | Vereda jardín, Cazuela libre, Construir cazuela |
| Corte horizontal de raíces | Sin medida | Profundidad en cm, opcional (en el reporte suele ser 15) |
| Descopado | No existía | Casilla en el paso 4, junto a Urgente |
| Especies | 23 propuestas ("Fresno americano"…) | Las 76 del reporte ("Fresno", "Plátano", "Ficus"…, más "Sin determinar") |
| Distancias y perímetro | Cualquier número | Con rango: medianera 0 a 100 m, perímetro hasta 20 m, distancia al borde hasta 20 m, profundidad hasta 200 cm |

- Las especies de la base de producción se actualizan solas al reiniciar el servidor:
  agrega las que faltan y desactiva las viejas sin borrarlas (los dictámenes que ya las
  usan siguen bien). Las que agregó un ingeniero no se tocan.
- El reporte real tiene datos personales de vecinos y cotizaciones: quedó en `.gitignore`
  (nuevo, en la raíz) y **no se sube** al repo, que es público.

### Archivos

- Catálogos: `sistema/backend/src/catalogos.json` y sus copias en `sistema/frontend/src/` y
  `datos-prueba/`; `datos-prueba/especies.json`, `dictamenes-ejemplo.json` y
  `dictamenes-conflicto.json` pasados a los valores nuevos.
- Backend: `prisma/schema.prisma` e `init.sql` (`dictamen.descopado`,
  `trabajo_subterraneo.profundidad_cm`), `services/dictamenes.ts` (validación y firma),
  `services/registro-dictamen.ts` (guardado y envío al SUA), `services/pdf.ts`, `seed.ts`,
  `especies-catalogo.ts` (nuevo) y `server.ts`.
- Frontend: `pages/DictamenForm.tsx`, `lib/reglas.ts`, `lib/canonical.ts` y el vector de
  firma regenerado (`lib/vector-canonico.json`).
- Tests: 5 nuevos de backend y 2 de frontend.
- Documentación: `dictamen-tecnico-campos.md`, `er-modelo.md`, `er.puml`, `diseño-ui.md`,
  `arquitectura-tecnica.md`, el wireframe del formulario y `README-datos-prueba.md`.

### Verificado y pendiente

- Verificado: 84 tests de backend y 15 de frontend pasan (incluye el vector de firma
  compartido, que confirma que el hash del celular y el del servidor siguen coincidiendo),
  y la PWA compila.
- **No verificado**: la prueba de punta a punta (en tu PC no están Playwright para Python
  ni `psql`), verlo en el celular y en el servidor.
- **Antes de subirlo al servidor**: sincronizá los dictámenes que haya firmados sin conexión
  en algún celular. Si alguno queda en la cola con la versión vieja, el servidor lo rechaza
  por los valores viejos de las listas.
- La base de desarrollo de tu PC tiene dictámenes con los valores viejos; `npm run seed` la
  recarga con los nuevos (borra lo que haya).
- Para revisar más adelante: en el reporte el expediente tiene letra y año ("Expte.
  21366-C-2021") y el sistema hoy pide un número entero; y el SUA ya trae coordenadas de
  cada reclamo (Gauss-Krüger), que podrían reemplazar la geocodificación.

---

## 13/11/2026 — Sin clave de ORS, el aviso de trazado aproximado no aparecía

### Problema

Después de subir RF-63 al servidor, la ruta se seguía viendo con líneas rectas y sin el
aviso. Si el servidor no tiene `ORS_API_KEY`, el simulador del recorrido unía las paradas
en línea recta y la guardaba como si fuera el recorrido por calles, así que el mapa la
dibujaba continua y sin aviso.

### Solución

- `MockRecorrido` ahora responde "no disponible" salvo en los tests (`simular = true`).
  Sin clave, la ruta guarda `recorrido = null` y el mapa muestra la recta punteada con
  el aviso "Trazado aproximado en línea recta".
- Archivos: `sistema/backend/src/providers/index.ts`, `sistema/backend/test/helpers.ts`.
- Verificado: los 24 tests de rutas pasan.
- **No verificado**: si al servidor de Oracle le falta la clave o si el celular mostraba
  la versión vieja. Ver los comandos de diagnóstico de la conversación del 13/11/2026.

---

## 10/11/2026 — La ruta se dibuja por las calles (RF-63)

### Problema

El mapa de "Mi ruta de hoy" unía las paradas con líneas rectas, como si el ingeniero
fuera en avión: cruzaba manzanas y no respetaba la mano de las calles ni el ir a pie.

El **orden** de visita ya estaba bien: se calcula con la matriz de OpenRouteService, que
usa distancias reales por calle (perfil a pie o en vehículo). Lo que fallaba era solo el
**dibujo**: el frontend trazaba una recta entre cada par de puntos.

### Solución

- Después de reservar la ruta se pide a **OpenRouteService Directions** el recorrido real
  con la partida y las solicitudes en el orden de visita:
  - **A pie** (`foot-walking`): veredas, sendas peatonales y plazas; no depende de la mano.
  - **En vehículo** (`driving-car`): respeta el sentido de circulación y los giros
    prohibidos que tiene cargados OpenStreetMap.
- La línea se guarda en la ruta (`Ruta.recorrido`), así que se ve también **sin conexión**.
- Los km y minutos del encabezado pasan a ser los del recorrido dibujado.
- Si ORS no devuelve el recorrido (caído o lento, espera hasta 3 s), la ruta se genera
  igual y el mapa une las paradas con una **línea punteada**, con el aviso "Trazado
  aproximado en línea recta".
- Sin clave de ORS también se ve la línea punteada con el aviso (corregido el 13/11/2026,
  ver la entrada de arriba).

### Archivos de código

| Archivo | Cambio |
|---|---|
| `sistema/backend/src/providers/index.ts` | `IRecorrido`, `OrsRecorrido` (Directions, por tramos de 50 puntos) y `MockRecorrido` |
| `sistema/backend/src/services/rutas.ts` | `trazarRecorrido()` después de la reserva, fuera del bloqueo |
| `sistema/backend/prisma/schema.prisma`, `prisma/init.sql` | Columna `ruta.recorrido` (JSONB) |
| `sistema/frontend/src/components/Mapa.tsx` | Línea punteada si el trazado es aproximado |
| `sistema/frontend/src/components/RutaActiva.tsx` | Dibuja `ruta.recorrido`; aviso si falta |
| `sistema/frontend/src/lib/datos.ts` | Campo `recorrido` en el tipo `Ruta` |
| `sistema/backend/test/rutas.test.ts`, `test/helpers.ts` | 3 tests nuevos de RF-63 |

### Documentación actualizada

| Documento | Cambio |
|---|---|
| `requisitos.md` | Nuevo **RF-63** en el Módulo 3 |
| `arquitectura-tecnica.md` | Tabla de tecnologías, endpoint `/rutas` y punto 5 nuevo en la sección 5 |
| `er-modelo.md`, `diagramas/er.puml` | Atributo `Ruta.recorrido` y nota en la Decisión 7 |
| `historias-de-usuario.md` | HU-04: RF-63 relacionado y criterio de aceptación 7 |
| `casos-de-uso.md` | CU-04: paso 4.1 y excepción E4 |

### Verificado y pendiente

- Verificado: Directions con tu clave real de ORS responde en 1 a 2 s; para los mismos
  puntos da 6,8 km a pie y 7,2 km en auto (en auto rodea por la mano de las calles).
  Acepta 51 puntos en un solo pedido.
- Verificado: 79 tests de backend y 13 de frontend pasan, y la PWA compila. (Una primera
  corrida, justo después de arrancar Docker, tuvo 9 fallas en una suite que no se
  repitieron ni sola ni en la corrida completa siguiente. El 13/11/2026 volvió a pasar igual
  justo después de arrancar Docker: son vencimientos de 30 s con la base recién levantada.)
- **No verificado**: ver el trazado en el celular ni en el servidor de Oracle. Para
  subirlo: `git pull` y `docker compose -f docker-compose.prod.yml --env-file .env.prod up
  -d --build` (el `init.sql` agrega la columna solo). Las rutas ya generadas no tienen
  recorrido y se ven punteadas hasta que se genere una nueva.
- Consumo: cada ruta generada gasta 1 pedido de Directions (el plan gratuito de ORS da
  2000 por día), además del de la matriz.
- La calidad del trazado depende de OpenStreetMap: si una calle tiene mal cargada la
  mano o falta una senda, el recorrido lo va a reflejar.
