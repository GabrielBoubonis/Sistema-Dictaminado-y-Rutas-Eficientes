# Ejercicio: partir una épica en slices verticales

## La épica

> Como Operador, quiero generar una ruta de trabajo con los criterios que yo elija, para
> organizar mi jornada de forma eficiente según cómo prefiero trabajar.
> _(HU-04 — `historias-de-usuario.md`)_

_Así como está escrita en `historias-de-usuario.md`, es una épica gorda: combina cuatro
criterios de armado (distrito, prioridad, zona dibujada en el mapa, modo de desplazamiento),
una regla de selección automática cuando sobran candidatas, y el cálculo del orden de
visita, todo en una sola historia. La propia validación INVEST de HU-04 ya lo señala
("Pequeña: No del todo") y el `DoR.md` la usa como ejemplo de historia que **no pasa** el
filtro por ese motivo — este ejercicio es la resolución concreta de esa falta: la misma
épica, partida en historias que sí se pueden estimar y entregar de punta a punta._

---

## Parte A — Historias verticales

_Entre 5 y 8 historias VERTICALES. Vertical significa que cada historia, sola, entrega algo
usable de punta a punta ("diseñar la pantalla de generar ruta" no es vertical; "generar una
ruta filtrando por distrito y prioridad" sí lo es)._

### Historia 1 — Generar una ruta filtrando por distrito y prioridad

| Campo | Detalle |
|-------|---------|
| Historia | Como Operador, quiero generar una ruta de trabajo indicando un distrito y un nivel de prioridad, para organizar mi jornada sin tener que elegir caso por caso. |

**Criterios de aceptación**

1. Dado que elijo un distrito y un nivel de prioridad, cuando confirmo la generación, el sistema arma una ruta con las solicitudes pendientes de ese distrito y esa prioridad, y la reserva para mí.
2. Dado que no indico distrito, el sistema igual arma la ruta considerando solo la prioridad elegida, sin exigir el distrito como obligatorio.

---

### Historia 2 — Elegir el modo de desplazamiento al generar la ruta

| Campo | Detalle |
|-------|---------|
| Historia | Como Operador, quiero indicar si voy a desplazarme a pie o en vehículo al generar mi ruta, para que el tiempo y la distancia estimados sean realistas. |

**Criterios de aceptación**

1. Dado que elijo "vehículo" en vez de "a pie", el sistema calcula el tiempo y la distancia estimados de mi ruta usando ese modo de desplazamiento.
2. Dado que no elijo ningún modo, el sistema no me permite confirmar la generación de la ruta, porque es un dato obligatorio para el cálculo.

---

### Historia 3 — Delimitar la ruta dibujando una zona en el mapa

| Campo | Detalle |
|-------|---------|
| Historia | Como Operador, quiero dibujar manualmente una zona en el mapa para delimitar qué solicitudes entran en mi ruta, para cubrir un área puntual aunque no coincida exactamente con los límites de un distrito. |

**Criterios de aceptación**

1. Dado que dibujo una zona en el mapa, junto con o en lugar de distrito/prioridad, el sistema arma la ruta únicamente con las solicitudes pendientes que caen dentro de esa zona y además cumplen los demás criterios elegidos.
2. Dado que la zona que dibujé no contiene ninguna solicitud pendiente, el sistema me lo informa antes de confirmar, en vez de generar una ruta vacía.

---

### Historia 4 — Ver cuántas solicitudes cumplen mis criterios antes de confirmar

| Campo | Detalle |
|-------|---------|
| Historia | Como Operador, quiero ver cuántas solicitudes cumplen los criterios que elegí antes de confirmar la generación de la ruta, para ajustarlos si el resultado no me conviene. |

**Criterios de aceptación**

1. Dado que ya elegí mis criterios (distrito, prioridad, zona y/o modo), el sistema me muestra en vivo la cantidad de solicitudes que los cumplen, antes de que confirme nada.
2. Dado que cambio cualquier criterio, el número mostrado se actualiza sin necesidad de un paso adicional de "buscar".

---

### Historia 5 — Recibir automáticamente las solicitudes más convenientes cuando hay más candidatas que cupo

| Campo | Detalle |
|-------|---------|
| Historia | Como Operador, quiero que el sistema elija por mí cuáles solicitudes incluir cuando hay más casos disponibles que los que pedí, priorizando los más antiguos y el recorrido más eficiente, para no tener que decidir manualmente caso por caso. |

**Criterios de aceptación**

1. Dado que las solicitudes que cumplen mis criterios superan la cantidad que indiqué, el sistema incluye primero las más antiguas, y entre solicitudes de antigüedad similar prioriza las que generan el recorrido más corto.
2. Dado que algunas solicitudes candidatas quedaron afuera de mi ruta por este mecanismo, siguen disponibles como pendientes para cualquier otro ingeniero.

---

### Historia 6 — Consultar el orden de visita ya calculado de mi ruta

| Campo | Detalle |
|-------|---------|
| Historia | Como Operador, quiero ver las solicitudes de mi ruta ya generada numeradas en el orden en que me conviene visitarlas, para no perder tiempo decidiendo por dónde empezar. |

**Criterios de aceptación**

1. Dado que mi ruta ya fue generada, el sistema me muestra las solicitudes numeradas en el orden que minimiza el tiempo y la distancia total, partiendo de la sede de la Dirección General de Parques y Paseos.
2. Dado que mi ruta combina solicitudes de distrito/prioridad con solicitudes dentro de una zona dibujada (Historia 3), el orden de visita las integra a todas en un único recorrido, sin agruparlas por cómo fueron seleccionadas.

---

## Parte B — Los caminos que no salen bien

_Elegimos UNA de las historias de la Parte A. Las últimas tres preguntas son las
importantes: para cada una, indicamos qué debería hacer el sistema y quién tendría que
decidirlo._

**Historia elegida:** Historia 5 — Recibir automáticamente las solicitudes más convenientes
cuando hay más candidatas que cupo. _(Es la que concentra la lógica más propensa a fallar:
corre contra datos compartidos con otros ingenieros y contra un servicio externo de
ruteo, a diferencia de las Historias 1 a 3, que son filtros simples de lectura.)_

| Pregunta | Qué hace el sistema | Quién decide (analista / negocio / técnica) |
|----------|----------------------|-----------------------------------------------|
| ¿Qué pasa si ninguna solicitud cumple los criterios elegidos? | Informa que no hay casos disponibles con esos criterios y permite modificar los criterios sin perder lo ya elegido, en vez de generar una ruta vacía (CU-04, excepción E2). | Analista funcional (texto y momento del aviso) + Negocio (no tiene sentido reservar una ruta sin contenido). |
| ¿Qué pasa si, mientras se calcula la selección, otro ingeniero reserva una de las solicitudes candidatas (condición de carrera)? | Reserva las solicitudes de forma atómica recién al confirmar, no al calcular la previsualización: si alguna de las candidatas ya fue tomada por otra ruta en ese instante, la excluye de la selección final y completa el cupo con la siguiente solicitud disponible según el mismo criterio de antigüedad/eficiencia, en vez de fallar toda la operación. | Técnica (bloqueo/transacción al momento de reservar) + Negocio (preferir completar el cupo con la siguiente opción, no dejar al ingeniero con una ruta más chica sin avisarle por qué). |
| ¿Qué pasa si el servicio externo de mapas/ruteo no responde mientras se calcula la eficiencia del recorrido? | No bloquea la generación de la ruta: selecciona las solicitudes usando solo el criterio de antigüedad, deja pendiente el cálculo de orden óptimo, y avisa al ingeniero que el orden de visita es provisorio (lista sin optimizar) hasta que el servicio vuelva a responder. | Técnica (qué pasa si el proveedor de mapas cae: degradación en vez de error total) + Negocio (prioriza no dejar al ingeniero sin ruta por una falla ajena al sistema). |
| ¿Qué pasa si el ingeniero toca "Generar ruta" dos veces seguidas? | El segundo toque no dispara una segunda selección ni una segunda reserva: el botón se deshabilita apenas se envía la primera solicitud, y el sistema identifica cada pedido de generación con un identificador único que descarta cualquier solicitud duplicada con el mismo identificador. | Técnica (idempotencia de la operación de generación en el backend) + Analista funcional (feedback visual mientras se procesa, por ejemplo un estado "Generando ruta..."). |
| ¿Qué pasa si se cae la conexión justo después de confirmar, antes de que el ingeniero vea el resultado? | La app no asume que la ruta no se generó: al recuperar conexión, consulta el estado real de esa operación puntual (con el mismo identificador único) en vez de permitir tocar "Generar ruta" otra vez a ciegas, evitando una segunda reserva duplicada sobre las mismas solicitudes. | Técnica (diseño de la consulta de estado/reconciliación tras reconectar) + Negocio (qué mensaje ve el ingeniero mientras el resultado de su ruta es incierto). |

---

## Parte C — Defensa

_Se hace oral, en el plenario. No se documenta en este archivo._
