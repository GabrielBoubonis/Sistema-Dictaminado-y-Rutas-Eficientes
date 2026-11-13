# Registro de cambios

Cambios hechos al sistema y a la documentación, del más nuevo al más viejo.

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
