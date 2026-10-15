# Definition of Ready (DoR)

_Antes de que una historia entre a desarrollo, tiene que pasar un filtro: el Definition of
Ready. Es un acuerdo del equipo sobre qué condiciones mínimas debe cumplir una historia para
considerarse "lista para trabajar". Si no las cumple, vuelve a refinamiento._

---

## Checklist del equipo

_Entre 6 y 10 ítems. Cada uno redactado como una condición verificable ("la historia tiene
criterios de aceptación escritos"), no como un deseo ("la historia está bien definida")._

| # | Ítem | Justificación (qué problema evita, máx. 3 renglones) |
|---|------|--------------------------------------------------------|
| 1 | La historia está redactada en formato clásico completo (rol, acción, beneficio), con un único actor identificable. | Evita ambigüedad sobre quién ejecuta la acción y por qué. Sin esto, distintos desarrolladores pueden interpretar roles o permisos distintos para la misma pantalla. |
| 2 | La historia tiene al menos un criterio de aceptación escrito en formato Dado/Cuando/Entonces (o equivalente verificable). | Sin criterios concretos, "terminado" queda a criterio subjetivo de quien programa, y el testeo no tiene contra qué comparar el resultado. |
| 3 | Los RF/RNF de los que depende la historia ya están definidos y aprobados, sin decisiones técnicas pendientes de analizar. | Si el requisito funcional todavía no está cerrado (por ejemplo, un algoritmo sin definir), el desarrollo arranca sobre una base que puede cambiar a mitad de sprint. |
| 4 | Las dependencias con otras historias están identificadas, y esas historias ya están resueltas o priorizadas antes en el mismo sprint. | Evita bloqueos a mitad de sprint por depender de una pantalla o lógica que todavía no existe. |
| 5 | La historia cumple el criterio "Pequeña" de INVEST: se puede completar dentro de un sprint sin dividirla. | Una historia demasiado grande no se puede estimar con confianza y arriesga quedar a medio terminar al cierre del sprint. |
| 6 | Las reglas de negocio y validaciones (incluidas las excepciones y casos de error) están explícitas, no implícitas. | Si una regla de exclusión o un caso borde no está escrito, cada desarrollador la completa "a ojo", generando comportamientos distintos entre pantallas. |
| 7 | Existe al menos un wireframe o referencia de diseño de la pantalla involucrada. | Sin una referencia visual mínima, el desarrollo de la interfaz empieza a ciegas y genera retrabajo cuando se define el diseño después. |
| 8 | El equipo tiene acordado cómo se va a verificar/testear el resultado (qué se mide, con qué dato de prueba). | Si nadie sabe cómo probarlo, el criterio de aceptación queda solo como una frase y no como algo ejecutable en QA. |

---

## Aplicación a tres historias propias

_Elegimos tres historias de usuario de `historias-de-usuario.md` con resultados distintos a
propósito: una que pasa el filtro completo (HU-01), y dos que muestran huecos reales que ya
habíamos señalado nosotros mismos en la validación INVEST de cada una (HU-04 y HU-09)._

### Historia 1 — HU-01 — Inicio de sesión en el sistema

| Ítem (según checklist) | ¿Pasa? | Qué le falta (si no pasa) |
|-------------------------|--------|-----------------------------|
| 1 | Sí | — |
| 2 | Sí | — |
| 3 | Sí | — |
| 4 | Sí | — (es la primera historia del flujo; el resto depende de ella, no al revés) |
| 5 | Sí | — |
| 6 | Sí | — |
| 7 | Sí | — |
| 8 | Sí | — |

**Resultado: pasa el filtro completo.** Se limita a dos campos y dos validaciones
secuenciales ya cerradas en RF-01 a RF-04, tiene sus 4 criterios de aceptación, su wireframe
(`01-login.svg`) y una forma concreta de probarla (criterio 2: contraseña incorrecta →
mensaje de error genérico, verificable inspeccionando la respuesta).

---

### Historia 2 — HU-04 — Generar ruta de trabajo diaria

| Ítem (según checklist) | ¿Pasa? | Qué le falta (si no pasa) |
|-------------------------|--------|-----------------------------|
| 1 | Sí | — |
| 2 | Sí | — |
| 3 | No | RF-15 define **qué** criterios se combinan (distrito, prioridad, zona en mapa), pero no **cómo** se resuelve el armado cuando los criterios entran en conflicto entre sí (por ejemplo, qué prioriza el sistema si "20 solicitudes del distrito Centro" y "3 de prioridad alta en otro distrito" compiten por las mismas solicitudes disponibles). Falta ese análisis técnico antes de estimar con confianza. |
| 4 | Sí | — |
| 5 | No | Ya lo señalamos en la validación INVEST de la propia historia ("Pequeña: No del todo"): combina varios criterios de filtrado con selección manual en mapa en una sola historia. Falta dividirla (por ejemplo, "armar ruta por criterios" vs. "ajustar ruta con selección manual en mapa"). |
| 6 | Parcial | La regla de exclusión entre rutas (RF-16) está clara, pero no está escrita la regla de desempate cuando varios criterios seleccionados a la vez compiten por las mismas solicitudes. |
| 7 | Sí | — |
| 8 | Parcial | No hay una métrica definida de qué significa una ruta "eficiente" (¿menor distancia recorrida?, ¿mayor cantidad de casos por hora?). Sin esa métrica, un test solo puede verificar que la ruta respeta los criterios elegidos, no que sea la mejor ruta posible. |

**Resultado: no pasa.** Antes de entrar a desarrollo necesita: (a) una definición técnica de
cómo se resuelve el armado cuando los criterios compiten entre sí, (b) dividirse en historias
más chicas, y (c) una métrica de eficiencia acordada para poder testearla objetivamente.

> **Nota:** los tres puntos quedaron resueltos en rondas posteriores de trabajo. El punto
> (b) —dividirla— se resuelve en `slicing.md`: HU-04 se usa ahí como la épica a fragmentar
> en historias verticales, con un análisis de caminos alternativos sobre la más riesgosa de
> esas historias. El punto (a) —cómo se resuelve el armado cuando los criterios compiten
> entre sí— y el punto (c) —la métrica de "eficiencia"— quedaron definidos juntos en
> `alcance.md` (sección 2.5) y en `arquitectura-tecnica.md`: la eficiencia se mide como
> distancia total estimada en metros (no tiempo, por ser menos reproducible en testing), y
> el desempate agrupa primero por franjas de antigüedad de 2 días antes de aplicar esa
> métrica.

---

### Historia 3 — HU-09 — Dictaminar sin conexión a internet

| Ítem (según checklist) | ¿Pasa? | Qué le falta (si no pasa) |
|-------------------------|--------|-----------------------------|
| 1 | Sí | — |
| 2 | Sí | — |
| 3 | No | RF-30/RF-31/RF-32 definen el comportamiento esperado, pero no la tecnología de almacenamiento local a usar (Service Worker, IndexedDB, u otra). Ya lo habíamos marcado en la propia validación INVEST de la historia ("Estimable: Parcial... requiere un análisis técnico previo"). |
| 4 | Sí | — |
| 5 | Sí | — |
| 6 | Sí | — |
| 7 | No | El wireframe de dictamen (`04-formulario-dictamen.svg`) muestra el badge "SIN SEÑAL" en el encabezado, pero no existe una referencia visual de qué pasa si, por ejemplo, falla el guardado local (mensaje de error, reintento manual) — solo está cubierto el caso feliz de guardado offline exitoso. |
| 8 | Parcial | No está acordado cómo se va a simular la ausencia de conexión durante el testeo (¿modo avión real en el dispositivo?, ¿mock de la API de red?). Sin eso, es difícil escribir un caso de prueba reproducible. |

**Resultado: no pasa.** Antes de entrar a desarrollo necesita: (a) la decisión técnica de
almacenamiento local, (b) un estado visual para el caso de error al guardar sin conexión, y
(c) un mecanismo acordado para simular la falta de señal en las pruebas.
