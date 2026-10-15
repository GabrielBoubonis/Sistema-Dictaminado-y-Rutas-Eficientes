# Historias de usuario
_Presentar al menos una historia de usuario representativa por módulo._
_Cada historia debe incluir formato clásico, criterios de aceptación y validación INVEST._

---

## HU-01 — Inicio de sesión en el sistema

| Campo | Detalle |
|-------|---------|
| Historia | Como usuario del sistema, quiero iniciar sesión con mi usuario y contraseña, para acceder a las solicitudes y funciones habilitadas para mi rol. |
| Módulo | Autenticación y gestión de usuarios |
| Requisitos relacionados | RF-01, RF-02, RF-03, RF-04, RF-50 |

### Criterios de aceptación

1. Dado que ingreso un usuario y contraseña válidos y registrados localmente, cuando envío el formulario de login, el sistema valida contra la Autenticación Institucional y me otorga acceso con un token JWT.
2. Dado que ingreso una contraseña incorrecta, cuando envío el formulario, el sistema rechaza el acceso y muestra un mensaje de error genérico, sin indicar si el usuario existe o no.
3. Dado que mi usuario no existe en la base local del sistema, cuando intento iniciar sesión, el sistema rechaza el acceso aunque mis credenciales sean válidas en la Autenticación Institucional, mostrando el mismo mensaje genérico del criterio 2 (RF-50), sin distinguir el motivo del rechazo.
4. Dado que inicié sesión correctamente, cuando pasan 30 minutos sin que interactúe con el sistema, mi sesión se cierra automáticamente.

### Validación INVEST

| Criterio | ¿Se cumple? | Observación |
|----------|-------------|-------------|
| Independiente | Parcial | Es la base de la que dependen el resto de las historias (nadie puede dictaminar ni generar rutas sin loguearse antes). Es una dependencia estructural típica del módulo, no una dependencia de negocio arbitraria. |
| Negociable | Sí | El mecanismo interno de validación (JWT, API key contra la Autenticación Institucional) puede cambiarse sin afectar el criterio de aceptación 1, que solo exige que el acceso se otorgue si ambas validaciones son correctas. |
| Valiosa | Sí | Se verifica con el criterio 1: sin un login exitoso, ninguna otra pantalla del sistema es alcanzable, lo que la vuelve bloqueante para el resto del backlog. |
| Estimable | Sí | El equipo puede descomponerla en tareas concretas y conocidas (formulario, llamada a Autenticación Institucional, manejo del JWT) porque el mecanismo en dos pasos ya está definido en RF-01 y RF-02, sin puntos ambiguos pendientes. |
| Pequeña | Sí | Se limita a 2 campos y dos validaciones secuenciales (RF-01 a RF-04); no incluye recuperación de contraseña ni alta de usuarios, que son parte de HU-02. |
| Verificable | Sí | Se comprueba con el criterio 2: al enviar una contraseña incorrecta, la respuesta debe rechazar el acceso sin indicar cuál de los dos datos falló, verificable inspeccionando el mensaje de error devuelto por el sistema. |

---

## HU-02 — Gestión de usuarios y roles

| Campo | Detalle |
|-------|---------|
| Historia | Como Administrador, quiero crear, modificar y dar de baja usuarios del sistema y asignarles un rol, para controlar quién puede acceder y qué puede hacer cada persona. |
| Módulo | Autenticación y gestión de usuarios |
| Requisitos relacionados | RF-06, RF-07, RF-08, RF-54 |

### Criterios de aceptación

1. Dado que soy Administrador, cuando creo un nuevo usuario con una contraseña que cumple los requisitos de complejidad (8 caracteres, mayúscula, minúscula, número y carácter especial), el sistema lo da de alta y le asigna el rol seleccionado (Administrador, Jefe, Operador o Lector).
2. Dado que intento crear un usuario con una contraseña que no cumple los requisitos de complejidad, el sistema rechaza la creación e indica qué requisito falta.
3. Dado que un usuario existente perdió su contraseña, cuando la restablezco desde mi panel de Administrador, el sistema genera una nueva contraseña y desactiva la anterior.
4. Dado que doy de baja un usuario, cuando esa persona intenta iniciar sesión, el sistema le niega el acceso.
5. Toda alta, baja o cambio de rol que realizo queda registrada en el log de auditoría (quién la hizo, qué acción fue, y cuándo), sin que yo ni ningún otro usuario pueda editarla o borrarla desde la aplicación.

### Validación INVEST

| Criterio | ¿Se cumple? | Observación |
|----------|-------------|-------------|
| Independiente | Sí | Se puede desarrollar y probar con un usuario Administrador de prueba, sin necesidad de que existan solicitudes, rutas o dictámenes cargados en el resto del sistema. |
| Negociable | Sí | La forma de generar la contraseña temporal al restablecer (criterio 3) puede negociarse (aleatoria o definida por el Administrador) sin cambiar el valor de la historia: que el usuario recupere el acceso. |
| Valiosa | Sí | Se verifica con el criterio 4: sin esta alta, no hay forma de que un nuevo ingeniero o Jefe obtenga acceso al sistema, dejando el trabajo operativo bloqueado. |
| Estimable | Sí | El equipo puede estimarla porque las reglas de complejidad de contraseña ya están definidas sin ambigüedad en RNF-05. |
| Pequeña | Sí | Se acota a alta, edición de rol y restablecimiento de contraseña de un usuario por vez (criterios 1 a 4), más el registro automático de esa acción en auditoría (criterio 5, que no agrega una pantalla propia); no incluye importación masiva. |
| Verificable | Sí | Se comprueba con el criterio 2: al intentar crear un usuario con una contraseña que viole alguna regla de RNF-05, el sistema debe rechazar el alta e indicar el requisito faltante, verificable probando una contraseña que incumpla cada regla por separado. |

---

## HU-03 — Consultar solicitudes derivadas a la Dirección Técnica

| Campo | Detalle |
|-------|---------|
| Historia | Como Operador, quiero ver el listado de solicitudes derivadas a la Dirección Técnica de Arbolado, para saber qué casos tengo disponibles para dictaminar. |
| Módulo | Lectura de solicitudes del SUA |
| Requisitos relacionados | RF-09, RF-10, RF-11, RF-13, RF-62 |

### Criterios de aceptación

1. Dado que inicié sesión, cuando accedo al listado de solicitudes, el sistema muestra únicamente las de tipo reclamo, subtipo "problema con el arbolado público", derivadas a Parques y Paseos – Dirección Técnica.
2. Cada solicitud del listado muestra su identificador (Número de SUA - Año) y su estado actual (Pendiente, Dictaminada o Pendiente-revisión).
3. Dado que soy Operador o Jefe, puedo ver todas las solicitudes pendientes y pendientes-revisión, sin que estén restringidas a un ingeniero en particular.
4. Dado que el sistema no pudo ubicar una solicitud en el mapa, la solicitud aparece igual en el listado y puedo dictaminarla entrando desde ahí; el sistema reintenta ubicarla solo, sin que nadie la corrija a mano (RF-62).

### Validación INVEST

| Criterio | ¿Se cumple? | Observación |
|----------|-------------|-------------|
| Independiente | Parcial | Depende de que exista un login previo (HU-01). Es una dependencia estructural, no de negocio. |
| Negociable | Sí | La forma de mostrar el estado (ícono, color, texto) puede cambiar en el diseño de UI sin afectar el valor de la historia: que el ingeniero identifique qué solicitudes tiene disponibles. |
| Valiosa | Sí | Se verifica con el criterio 1: es el paso previo obligatorio a generar una ruta o dictaminar, ya que ninguna de esas acciones puede iniciarse sin ver antes el listado. |
| Estimable | Sí | El filtro de origen (RF-09) y los tres estados posibles (RF-11) ya están definidos con precisión, sin reglas de negocio pendientes de aclarar. |
| Pequeña | Sí | Se limita a traer y mostrar datos de solo lectura (criterios 1 y 2); no incluye edición ni acciones sobre las solicitudes, que pertenecen a otras historias. |
| Verificable | Sí | Se comprueba con el criterio 3: dos usuarios con rol distinto (Operador y Lector) deben recibir conjuntos de datos distintos, verificable comparando la respuesta del listado para cada uno. |

---

## HU-04 — Generar ruta de trabajo diaria

| Campo | Detalle |
|-------|---------|
| Historia | Como Operador, quiero generar una ruta de trabajo con los criterios que yo elija, para organizar mi jornada de forma eficiente según cómo prefiero trabajar. |
| Módulo | Generación de rutas de trabajo |
| Requisitos relacionados | RF-14, RF-15, RF-16, RF-19, RF-47, RF-48, RF-49 |

### Criterios de aceptación

1. Dado que tengo conexión a internet, cuando presiono "Generar ruta" definiendo una combinación de distrito, prioridad y/o una zona en el mapa, el sistema arma una ruta con las solicitudes pendientes que cumplen esos criterios.
2. Dado que una solicitud ya forma parte de la ruta activa de otro ingeniero, esa solicitud no aparece disponible para incluirse en mi nueva ruta.
3. Dado que no tengo conexión a internet, cuando intento generar una ruta, el sistema no permite la operación e informa que se necesita conexión.
4. Dado que elijo no filtrar por distrito, el sistema igual arma la ruta considerando el resto de los criterios seleccionados.
5. Dado que genero una ruta, debo indicar el modo de desplazamiento (a pie o en vehículo), y el sistema calcula el tiempo y la distancia del recorrido en función de ese modo.
6. Dado que las solicitudes que cumplen mis criterios superan la cantidad que pedí, el sistema selecciona cuáles incluir combinando antigüedad (las más antiguas primero) y eficiencia del recorrido resultante, y ordena su visita minimizando tiempo y distancia desde la sede de la Dirección General de Parques y Paseos.

### Validación INVEST

| Criterio | ¿Se cumple? | Observación |
|----------|-------------|-------------|
| Independiente | Parcial | Depende de HU-03 (ver solicitudes) y de HU-01 (login). Dependencia esperable dentro del flujo del sistema. |
| Negociable | Sí | El algoritmo concreto que resuelve la selección y el orden (por ejemplo, qué heurística de ruteo usar) puede ajustarse sin cambiar el valor de la historia, siempre que respete el objetivo ya definido: combinar antigüedad y eficiencia (RF-47, RF-48). |
| Valiosa | Sí | Se verifica con el criterio 1: sin una ruta generada, el ingeniero tendría que elegir manualmente cada caso, perdiendo el objetivo de organizar la jornada de forma eficiente. |
| Estimable | Parcial | El objetivo de selección y orden ya está definido (RF-47, RF-48, RF-49), pero la heurística o servicio externo concreto que lo implementa puede requerir un análisis técnico previo antes de poder estimarse con precisión. |
| Pequeña | No del todo | Combina varios criterios de filtrado, modo de desplazamiento y selección manual en mapa, lo que la hace más grande que el resto de las historias. Podría dividirse por criterio si el equipo lo prefiere. |
| Verificable | Sí | Se comprueba con el criterio 2: al generar una segunda ruta después de que una solicitud ya quedó reservada en la primera, esa solicitud no debe aparecer en el resultado de la segunda, verificable comparando ambos listados. |

---

## HU-05 — Restablecer ruta de trabajo

| Campo | Detalle |
|-------|---------|
| Historia | Como Operador, quiero poder descartar mi ruta actual y generar una nueva, para adaptarme si cambian las prioridades durante el día. |
| Módulo | Generación de rutas de trabajo |
| Requisitos relacionados | RF-17, RF-18 |

### Criterios de aceptación

1. Dado que tengo una ruta activa con solicitudes sin dictaminar, cuando presiono "Restablecer", el sistema descarta la ruta y libera esas solicitudes para que puedan incluirse en otras rutas.
2. Dado que ya dictaminé algunas solicitudes de mi ruta, esas no vuelven a aparecer como disponibles al restablecer, porque ya no están pendientes.
3. Dado que no presiono "Restablecer" ni dictamino todos los casos, cuando llegan las 18:00 hs, el sistema libera automáticamente las solicitudes no dictaminadas de mi ruta.

### Validación INVEST

| Criterio | ¿Se cumple? | Observación |
|----------|-------------|-------------|
| Independiente | No | Depende directamente de HU-04 (no existe ruta para restablecer si no se generó antes). Se podría fusionar con HU-04 si el equipo prefiere una sola historia de "gestión de ruta". |
| Negociable | Sí | El texto exacto del mensaje de confirmación antes de restablecer puede ajustarse sin cambiar el comportamiento esperado: liberar las solicitudes no dictaminadas. |
| Valiosa | Sí | Evita que un caso quede bloqueado indefinidamente para los demás ingenieros. |
| Estimable | Sí | Reutiliza la misma lógica de reserva/liberación ya definida para HU-04, por lo que el esfuerzo adicional es acotado y conocido. |
| Pequeña | Sí | Se limita a una acción de descarte y liberación (criterios 1 y 2); no agrega lógica nueva de armado de ruta, que ya existe en HU-04. |
| Verificable | Sí | Se comprueba con el criterio 3: pasadas las 18:00 hs con solicitudes sin dictaminar en la ruta, estas deben quedar disponibles para otro ingeniero, verificable consultando el listado general después de esa hora. |

---

## HU-06 — Completar y firmar un dictamen técnico

| Campo | Detalle |
|-------|---------|
| Historia | Como Operador, quiero completar y firmar digitalmente el dictamen técnico de una solicitud, para dejar registrada la intervención que corresponde sobre el ejemplar. |
| Módulo | Dictaminación |
| Requisitos relacionados | RF-20, RF-21, RF-22, RF-23, RF-24, RF-29, RF-45, RF-46, RF-51, RF-56, RF-61 |

### Criterios de aceptación

1. Dado que abro una solicitud en estado Pendiente o Pendiente-revisión, cuando completo el formulario del dictamen y confirmo el envío, el sistema me pide un segundo factor de autenticación (verificación biométrica del dispositivo, huella o reconocimiento facial) antes de firmarlo; recién entonces lo firma digitalmente con hash, timestamp y mi usuario, y lo guarda en la base de datos propia.
2. Dado que otro ingeniero envía un dictamen para el mismo caso antes que yo, cuando intento enviar el mío, el sistema rechaza mi envío indicando que el caso ya fue dictaminado.
3. Dado que el dictamen se firmó correctamente, el sistema envía al SUA todos los datos que cargué (campos del formulario, fotografías, autor y fecha), sin los datos internos del sistema (hash de firma, estado de sincronización).
4. El formulario del dictamen no muestra nombre ni datos de contacto del vecino, solo la información técnica necesaria (ubicación, descripción del reclamo).
5. Dado que no adjunté ninguna fotografía del ejemplar, cuando intento firmar el dictamen, el sistema me lo impide y me indica que debo cargar al menos una foto.
6. Dado que marco "Extracción" en el dictamen, el sistema deshabilita los campos de trabajos en la parte aérea y en la parte subterránea, para no dejar cargada una intervención incongruente con la extracción del ejemplar.
7. Dado que completo el formulario, los campos con valores conocidos (especie, nivel de daño, motivos, trabajos, complejidad, plantar, prioridad, domicilio) solo me permiten elegir una opción de una lista o un punto en el mapa, sin escribir libremente; solo Referencia de ubicación y Observaciones admiten texto libre. Nota N.° y Expediente N.° solo aceptan números enteros.
8. Dado que la especie del ejemplar no figura en el selector, cuando elijo "Agregar especie" e ingreso su nombre, el sistema la incorpora al catálogo y la deja seleccionada, rechazando nombres que ya existan (sin distinguir mayúsculas ni tildes).
9. Dado que marco "Sin trabajo", el sistema deshabilita Extracción y los trabajos aéreos y subterráneos; y dado que no marqué ninguna intervención ni "Sin trabajo", cuando intento firmar, el sistema me lo impide e indica que el dictamen debe decir algo (RF-61).

### Validación INVEST

| Criterio | ¿Se cumple? | Observación |
|----------|-------------|-------------|
| Independiente | Parcial | Depende de HU-03/HU-04 (tener el caso disponible) y de HU-01 (login). Dependencia esperable del flujo. |
| Negociable | Sí | El algoritmo exacto de hash puede decidirse técnicamente sin alterar el criterio de aceptación 1, que solo exige que el dictamen quede firmado con usuario y timestamp. |
| Valiosa | Sí | Se verifica con el criterio 1: es la acción que efectivamente resuelve el reclamo del vecino y genera el documento con valor legal; sin ella, el resto del sistema no tiene salida. |
| Estimable | Sí | Las reglas de firma (RF-22) y de exclusión por ejemplar único (RF-21) ya están definidas con precisión suficiente para descomponer la tarea en partes conocidas. |
| Pequeña | No del todo | Agrupa firma digital, persistencia local y envío al SUA en una sola historia. Podría dividirse en "completar y firmar" vs. "enviar al SUA" si el equipo prefiere historias más chicas. |
| Verificable | Sí | Se comprueba con el criterio 2: si dos usuarios envían un dictamen para el mismo Número de SUA-Año casi al mismo tiempo, solo el primero en confirmar debe quedar registrado y el segundo debe recibir un rechazo explícito, verificable con una prueba de envíos concurrentes. También con el criterio 1: un intento de firma sin completar el segundo factor no debe generar hash ni guardar el dictamen, verificable interrumpiendo ese paso. |

---

## HU-07 — Descargar el dictamen como documento imprimible

| Campo | Detalle |
|-------|---------|
| Historia | Como Operador, quiero descargar el dictamen firmado en formato PDF, para poder imprimirlo como documento legal cuando sea necesario. |
| Módulo | Dictaminación |
| Requisitos relacionados | RF-26 |

### Criterios de aceptación

1. Dado que un dictamen ya fue firmado, cuando presiono "Descargar", el sistema genera un archivo PDF con el contenido completo del dictamen.
2. El PDF incluye los datos de la firma digital (hash, timestamp, usuario).
3. La descarga está disponible tanto para dictámenes recién firmados como para cualquiera del historial.

### Validación INVEST

| Criterio | ¿Se cumple? | Observación |
|----------|-------------|-------------|
| Independiente | Sí | Se puede desarrollar una vez que existe al menos un dictamen firmado de prueba, sin acoplarse a la lógica de rutas ni de sincronización. |
| Negociable | Sí | El diseño visual del documento (orden de campos, tipografía) puede ajustarse sin cambiar el valor de la historia: entregar un documento imprimible con validez legal. |
| Valiosa | Sí | Se verifica con el criterio 1: resuelve una necesidad operativa real y explícita del usuario (imprimir el documento legal), no una mejora accesoria. |
| Estimable | Sí | Depende de datos que ya existen en el dictamen firmado (RF-22, RF-23), sin necesidad de generar información nueva para armar el documento. |
| Pequeña | Sí | Se limita a tomar un dictamen ya firmado y renderizarlo como archivo (criterios 1 y 2); no incluye edición ni una nueva firma. |
| Verificable | Sí | Se comprueba con el criterio 2: el archivo descargado debe contener el mismo hash, timestamp y usuario que figuran en el dictamen almacenado, verificable comparando ambos valores campo por campo. |

---

## HU-08 — Consultar el dictamen anterior de un caso re-derivado

| Campo | Detalle |
|-------|---------|
| Historia | Como Operador, quiero poder consultar el dictamen anterior de un caso en estado Pendiente-revisión, para tener contexto de lo que se evaluó la vez pasada antes de completar el nuevo. |
| Módulo | Dictaminación |
| Requisitos relacionados | RF-27, RF-28 |

### Criterios de aceptación

1. Dado que abro un caso en estado Pendiente-revisión, el formulario del nuevo dictamen se presenta en blanco, sin datos precargados del anterior.
2. Dado que quiero ver qué se dictaminó antes, cuando presiono el botón "Ver dictamen anterior", el sistema me muestra su contenido completo y quién lo firmó.
3. El sistema conserva todos los dictámenes históricos de un mismo caso, sin sobrescribirlos entre sí.

### Validación INVEST

| Criterio | ¿Se cumple? | Observación |
|----------|-------------|-------------|
| Independiente | Parcial | Depende de que exista al menos un dictamen previo del caso (HU-06). Es una dependencia de datos, no de desarrollo. |
| Negociable | Sí | La forma de presentar el dictamen anterior (modal o pantalla aparte) puede decidirse en el diseño de UI sin afectar el criterio de aceptación: que el ingeniero pueda consultarlo sin perder el formulario nuevo. |
| Valiosa | Sí | Se verifica con el criterio 2: le da al ingeniero el contexto de lo evaluado la vez anterior antes de decidir la nueva intervención, evitando que repita un diagnóstico ya descartado. |
| Estimable | Sí | Reutiliza el historial de dictámenes que ya debe existir por RF-27, por lo que no depende de una fuente de datos nueva. |
| Pequeña | Sí | Se limita a mostrar datos de solo lectura de un dictamen ya existente (criterio 2); no permite editarlo ni reutilizarlo como base del nuevo. |
| Verificable | Sí | Se comprueba con el criterio 1: al abrir un caso Pendiente-revisión, el formulario nuevo no debe traer ningún valor precargado del dictamen anterior, verificable inspeccionando los campos vacíos al ingresar. |

---

## HU-09 — Dictaminar sin conexión a internet

| Campo | Detalle |
|-------|---------|
| Historia | Como Operador, quiero poder completar y firmar un dictamen aunque no tenga señal en el lugar donde estoy, para no depender de la conectividad del momento para hacer mi trabajo. |
| Módulo | Trabajo sin conexión y sincronización |
| Requisitos relacionados | RF-30, RF-31, RF-32, RF-52, RF-57, RNF-16 |

### Criterios de aceptación

1. Dado que tengo la app instalada como PWA en mi captor y ya generé mi ruta con conexión, cuando pierdo la señal, puedo seguir abriendo los casos de mi ruta y completar el dictamen normalmente.
2. Dado que firmo un dictamen sin conexión, el sistema lo guarda localmente en el dispositivo, cifrado en reposo, con estado "pendiente de sincronizar".
3. Dado que intento generar una ruta nueva sin conexión, el sistema no lo permite, ya que esa acción requiere conexión.
4. Dado que alguien falla 5 veces seguidas al intentar iniciar sesión en mi captor, el sistema bloquea el acceso local a la aplicación en ese dispositivo.
5. Dado que mi sesión se cerró por inactividad y estoy sin señal, cuando ingreso mi contraseña, el sistema me deja reanudar la sesión solo si ya había ingresado con conexión ese día, no pasaron 7 días desde mi primer ingreso y el captor no fue revocado; al volver la señal, el sistema revalida mi usuario (RF-57).

### Validación INVEST

| Criterio | ¿Se cumple? | Observación |
|----------|-------------|-------------|
| Independiente | Parcial | Depende de HU-04 (ruta generada con conexión previa) y de HU-06 (lógica de completar/firmar dictamen). |
| Negociable | Sí | El mecanismo técnico de almacenamiento local puede decidirse en el diseño sin afectar el criterio de aceptación: que el dictamen quede firmado y guardado aunque no haya señal. |
| Valiosa | Sí | Se verifica con el criterio 1: sin esto, un ingeniero en una zona sin señal simplemente no podría trabajar, lo cual contradice una condición real y frecuente del trabajo de campo. |
| Estimable | Parcial | Depende de decisiones técnicas de almacenamiento local (Service Worker, IndexedDB) que pueden requerir un análisis previo. |
| Pequeña | Sí | Dentro de lo que permite el alcance offline definido: se limita a firmar y guardar localmente de forma cifrada (criterio 2) al bloqueo local por intentos fallidos (criterio 4) y a la reanudación de sesión sin señal (criterio 5), sin incluir la lógica de reintento de envío, que es de HU-10, ni la revocación remota del dispositivo, que es una acción de Administrador (HU-02). |
| Verificable | Sí | Se comprueba con el criterio 2: al firmar un dictamen en modo avión, debe quedar visible en el dispositivo con estado 'pendiente de sincronizar', verificable revisando la cola local sin reconectar. |

---

## HU-10 — Sincronización automática de dictámenes pendientes

| Campo | Detalle |
|-------|---------|
| Historia | Como Operador, quiero que los dictámenes que quedaron pendientes de enviar se sincronicen solos apenas recupero señal, para no tener que acordarme de reenviarlos manualmente. |
| Módulo | Trabajo sin conexión y sincronización |
| Requisitos relacionados | RF-25, RF-33, RF-34, RF-53 |

### Criterios de aceptación

1. Dado que tengo dictámenes en estado "pendiente de sincronizar", cuando el dispositivo recupera conexión, el sistema los envía automáticamente al SUA sin intervención manual.
2. Dado que el envío al SUA falla (por ejemplo, el SUA está caído), el sistema mantiene el dictamen en estado "pendiente de sincronizar" y lo reintenta siempre de forma automática, sin límite de reintentos, hasta que el servidor confirme su recepción.
3. En todo momento puedo ver un indicador que muestra si está todo sincronizado, cuántos dictámenes tengo pendientes, o si no tengo conexión.
4. Dado que un dictamen firmado sin conexión llega al servidor con un contenido distinto del que tenía al momento de la firma, el sistema detecta que el hash recalculado no coincide, rechaza la sincronización y lo marca para revisión del Administrador en lugar de darlo por sincronizado.

### Validación INVEST

| Criterio | ¿Se cumple? | Observación |
|----------|-------------|-------------|
| Independiente | Parcial | Depende de HU-09 (que existan dictámenes offline para sincronizar). Son dos caras del mismo flujo, separadas para que cada una sea más chica y verificable por separado. |
| Negociable | Sí | La frecuencia exacta de reintento puede ajustarse técnicamente sin cambiar el valor de la historia: que el envío ocurra sin intervención manual del usuario. |
| Valiosa | Sí | Se verifica con el criterio 1: sin esto, el trabajo hecho sin conexión (HU-09) nunca llegaría al SUA, y el ingeniero debería recordar reenviarlo manualmente. |
| Estimable | Sí | Reutiliza el mecanismo de reintento que ya debía existir para el caso 'SUA caído' (RF-25), por lo que no es una lógica nueva desde cero. |
| Pequeña | Sí | Se limita a la lógica de reintento y al indicador de estado (criterios 1 y 3); no incluye la firma del dictamen en sí, que pertenece a HU-09. |
| Verificable | Sí | Se comprueba con el criterio 1: al simular la recuperación de conexión con dictámenes en cola, estos deben quedar sincronizados en el SUA sin ninguna acción del usuario, verificable comparando el estado antes y después de reconectar. También con el criterio 4: alterando el contenido guardado localmente antes de sincronizar, la sincronización debe rechazarse en lugar de aceptarse. |

---

## HU-11 — Consultar métricas de dictaminación en el dashboard

| Campo | Detalle |
|-------|---------|
| Historia | Como Jefe, quiero ver un dashboard con la cantidad de solicitudes derivadas, dictaminadas y sin dictaminar, para hacer seguimiento del trabajo del equipo por período. |
| Módulo | Dashboard |
| Requisitos relacionados | RF-35, RF-36, RF-37 |

### Criterios de aceptación

1. Dado que accedo al dashboard, el sistema muestra la cantidad de solicitudes derivadas, dictaminadas y sin dictaminar.
2. Puedo filtrar esas métricas por mes y por año.
3. Dado que un caso fue re-derivado por vencimiento, ese evento se cuenta de forma independiente en las métricas del período en que ocurrió, aunque corresponda a un caso ya contado antes.

### Validación INVEST

| Criterio | ¿Se cumple? | Observación |
|----------|-------------|-------------|
| Independiente | Parcial | Depende de que existan datos generados por los módulos de solicitudes y dictaminación. Es una dependencia de datos, no de desarrollo del propio módulo. |
| Negociable | Sí | El tipo de visualización (números, barras o líneas) puede decidirse en el diseño de UI sin afectar el valor de la historia: que el Jefe pueda seguir el trabajo del equipo por período. |
| Valiosa | Sí | Se verifica con el criterio 1: es la única herramienta que le permite a la Dirección medir el trabajo del área sin pedirlo manualmente a cada ingeniero. |
| Estimable | Sí | Se apoya en datos que ya deben existir por los módulos de solicitudes y dictaminación (RF-35 a RF-37), sin necesidad de calcular métricas nuevas no definidas. |
| Pequeña | Sí | Se limita a las tres métricas base y el filtro por mes/año (criterios 1 y 2); no incluye métricas adicionales, marcadas como pendientes a futuro en Alcance. |
| Verificable | Sí | Se comprueba con el criterio 3: una solicitud re-derivada por vencimiento debe sumar +1 en el período de la re-derivación además de haber sumado +1 en el período original, verificable revisando ambos cortes de mes por separado. |

---

## HU-12 — Atender solicitudes de emergencia por tormenta

| Campo | Detalle |
|-------|---------|
| Historia | Como Operador, quiero generar una ruta con las solicitudes de tormenta más antiguas, para atender primero las emergencias climáticas que tienen prioridad máxima. |
| Módulo | Protocolo por tormenta |
| Requisitos relacionados | RF-38, RF-39, RF-40, RF-41, RF-42, RF-43 |

### Criterios de aceptación

1. Dado que Procesamiento de Datos derivó una solicitud con la etiqueta "emergencia por tormenta", esta aparece únicamente en la sección "Protocolo por tormenta", no en el listado general de solicitudes.
2. Dado que existen solicitudes de tormenta pendientes, el sistema muestra un indicador visual animado que señala su máxima prioridad.
3. Dado que indico una cantidad de solicitudes, cuando genero una ruta de tormenta, el sistema selecciona las solicitudes pendientes más antiguas hasta completar esa cantidad.
4. Una solicitud de tormenta incluida en mi ruta no puede aparecer en la ruta de otro ingeniero hasta que la dictamine, presione "Restablecer" o sean las 18:00 hs.
5. El dictamen de una solicitud de tormenta se completa con el mismo formulario que cualquier otro dictamen, sin campos adicionales.

### Validación INVEST

| Criterio | ¿Se cumple? | Observación |
|----------|-------------|-------------|
| Independiente | Parcial | Reutiliza la lógica de rutas y dictaminación ya construida en HU-04 y HU-06; depende de que esos módulos existan. |
| Negociable | Sí | La cantidad máxima de solicitudes por ruta de tormenta puede ajustarse sin cambiar el valor de la historia: atender primero las emergencias más urgentes. |
| Valiosa | Sí | Se verifica con el criterio 2: el indicador de máxima prioridad evita que una emergencia climática quede mezclada y postergada entre el trabajo habitual. |
| Estimable | Sí | Reutiliza la lógica ya estimada de HU-04 (armado de ruta) y HU-06 (dictaminación), por lo que el esfuerzo adicional es acotado y conocido. |
| Pequeña | Sí | Al reutilizar la lógica de rutas y dictaminación ya construida, el esfuerzo adicional se limita al filtro por antigüedad y al indicador visual (criterios 2 y 3). |
| Verificable | Sí | Se comprueba con el criterio 3: al pedir una ruta de tormenta de 5 solicitudes, el sistema debe incluir las 5 con la fecha de derivación más antigua entre las disponibles, verificable ordenando el listado completo por fecha y comparando. |

---

## HU-13 — Consultar el log de auditoría

| Campo | Detalle |
|-------|---------|
| Historia | Como Administrador, quiero consultar el log de auditoría de altas, bajas, cambios de rol y desbloqueos o revocaciones de captores, para poder revisar quién hizo qué cambio y cuándo ante cualquier incidente o duda. |
| Módulo | Auditoría |
| Requisitos relacionados | RF-54, RF-55 |

### Criterios de aceptación

1. Dado que soy Administrador, cuando accedo al log de auditoría, el sistema me muestra cada evento con el usuario que lo generó, la acción realizada y la fecha y hora.
2. Puedo filtrar el log por usuario, por tipo de acción y por rango de fechas.
3. No existe, desde la aplicación, ninguna opción para editar o eliminar un evento ya registrado en el log.

### Validación INVEST

| Criterio | ¿Se cumple? | Observación |
|----------|-------------|-------------|
| Independiente | Sí | Se puede construir y probar con eventos de auditoría de prueba, generados por acciones ya cubiertas en HU-02; no depende de rutas ni dictámenes. |
| Negociable | Sí | El diseño exacto de los filtros (criterio 2) puede ajustarse sin afectar el valor de la historia: poder reconstruir quién cambió qué y cuándo. |
| Valiosa | Sí | Se verifica con el criterio 1: sin este registro, ante un uso indebido de un permiso administrativo no habría forma de reconstruir lo ocurrido, a diferencia del historial de dictámenes que sí existe para la operación diaria. |
| Estimable | Sí | Reutiliza los eventos que ya deben generarse por RF-54 al modificar usuarios o rutas; no requiere una fuente de datos nueva, solo su consulta. |
| Pequeña | Sí | Se limita a una vista de solo lectura con filtros (criterios 1 y 2); no incluye exportación ni alertas automáticas. |
| Verificable | Sí | Se comprueba con el criterio 3: un intento de editar o borrar un evento del log, por cualquier vía de la aplicación, debe ser rechazado o simplemente no estar disponible, verificable revisando que la interfaz no ofrezca esa acción. |

---

## HU-14 — Identificar solicitudes re-derivadas como Pendiente-revisión

| Campo | Detalle |
|-------|---------|
| Historia | Como Operador, quiero que una solicitud ya dictaminada que vuelve a derivarse aparezca marcada como Pendiente-revisión, para distinguirla de una solicitud nueva y saber que necesita un nuevo dictamen. |
| Módulo | Lectura de solicitudes del SUA |
| Requisitos relacionados | RF-11, RF-12, RF-13 |

### Criterios de aceptación

1. Dado que Procesamiento de Datos re-deriva una solicitud ya dictaminada con el mismo Número de SUA-Año, cuando el sistema la lee, queda marcada como Pendiente-revisión y no como una solicitud nueva.
2. Una solicitud en Pendiente-revisión se muestra en el listado con una marca visible que la distingue de las Pendientes, y conserva su historial de dictámenes anteriores.
3. Dado que dictamino y firmo una solicitud en Pendiente-revisión, cuando el dictamen se sincroniza, la solicitud vuelve al estado Dictaminada.

### Validación INVEST

| Criterio | ¿Se cumple? | Observación |
|----------|-------------|-------------|
| Independiente | Parcial | Depende de que existan solicitudes ya dictaminadas (HU-06) y de cómo el SUA indique una re-derivación; es una dependencia de datos externa, a confirmar con el CIL/SUA. |
| Negociable | Sí | La forma de la marca visual (etiqueta, color, ícono) puede definirse en el diseño de UI sin afectar el valor: que el Operador no confunda una re-derivación con un caso nuevo. |
| Valiosa | Sí | Se verifica con el criterio 1: sin la marca, un caso re-derivado por vencimiento se trataría como nuevo y se perdería su trazabilidad. |
| Estimable | Parcial | El cambio de estado es simple; el esfuerzo depende de confirmar qué dato del SUA permite detectar la re-derivación (mismo Número de SUA-Año). |
| Pequeña | Sí | Se limita a marcar, mostrar y retornar el estado (criterios 1 a 3); no incluye resolver conflictos entre dictámenes. |
| Verificable | Sí | Se comprueba con los criterios 1 y 3: cargar una solicitud ya dictaminada con el mismo Número de SUA-Año debe dejarla en Pendiente-revisión, y al firmar un nuevo dictamen debe volver a Dictaminada. |

---

## HU-15 — Ver el desglose de solicitudes de tormenta en el dashboard

| Campo | Detalle |
|-------|---------|
| Historia | Como Jefe, quiero ver en el dashboard un desglose separado de las solicitudes de tormenta, además de que sumen a las métricas generales, para medir por separado el trabajo de emergencia sin perder el total del período. |
| Módulo | Dashboard |
| Requisitos relacionados | RF-35, RF-36, RF-37, RF-44 |

### Criterios de aceptación

1. Dado que accedo al dashboard, las solicitudes de tormenta se incluyen en las métricas generales de derivadas, dictaminadas y sin dictaminar.
2. Además, el dashboard muestra un desglose exclusivo de solicitudes de tormenta con los mismos tres indicadores.
3. Dado que filtro por mes y por año, el filtro se aplica tanto a las métricas generales como al desglose de tormenta.

### Validación INVEST

| Criterio | ¿Se cumple? | Observación |
|----------|-------------|-------------|
| Independiente | Parcial | Se apoya en el dashboard de HU-11 y en solicitudes de tormenta de HU-12; es una dependencia de datos, no de desarrollo. |
| Negociable | Sí | La presentación del desglose (tarjeta aparte, pestaña o gráfico) puede decidirse en el diseño de UI sin afectar el valor de la historia. |
| Valiosa | Sí | Se verifica con el criterio 2: permite a la Dirección medir la respuesta a emergencias climáticas sin perder el total general. |
| Estimable | Sí | Reutiliza las métricas de RF-35 a RF-37 con un filtro adicional por etiqueta de tormenta. |
| Pequeña | Sí | Se limita a un desglose con los mismos tres indicadores y el filtro existente (criterios 2 y 3); no agrega métricas nuevas. |
| Verificable | Sí | Se comprueba con el criterio 1: el total general debe ser igual a las solicitudes que no son de tormenta más las de tormenta, verificable con un período de datos de prueba. |

---

## HU-16 — Revisar los casos que quedan para revisión del Administrador

| Campo | Detalle |
|-------|---------|
| Historia | Como Administrador, quiero ver en un apartado "Para revisar" los dictámenes con integridad no verificada y los registros del SUA rechazados, para enterarme de lo que el sistema no pudo procesar solo. |
| Módulo | Administración |
| Requisitos relacionados | RF-53, RF-58, RNF-18 |

### Criterios de aceptación

1. Dado que soy Administrador, cuando abro "Para revisar", veo cada caso con su tipo, la solicitud afectada, la fecha y el motivo.
2. Dado que un dictamen firmado sin conexión llegó alterado al sincronizar, aparece en el listado como "integridad no verificada".
3. Dado que el SUA envió una solicitud con datos inválidos, aparece en el listado como "datos inválidos del SUA".
4. La pantalla es de solo consulta: no ofrece editar ni descartar casos.

### Validación INVEST

| Criterio | ¿Se cumple? | Observación |
|----------|-------------|-------------|
| Independiente | Parcial | Necesita que existan casos rechazados (HU-10 y la validación del SUA); se prueba con casos de prueba cargados a mano. |
| Negociable | Sí | Se puede discutir luego si el Administrador necesita acciones sobre cada caso, sin cambiar el valor de esta historia (hoy es solo consulta). |
| Valiosa | Sí | Se verifica con el criterio 1: sin este apartado, un rechazo quedaría invisible. |
| Estimable | Sí | Es un listado de solo lectura sobre datos que ya se generan. |
| Pequeña | Sí | Se limita a listar y ver el detalle (criterios 1 a 4); no incluye acciones, alertas ni mails. |
| Verificable | Sí | Se comprueba con los criterios 2 y 3 cargando un caso de cada tipo y revisando que aparezca. |

---

## HU-17 — Elegir qué dictamen queda vigente cuando hay dos para el mismo caso

| Campo | Detalle |
|-------|---------|
| Historia | Como Jefe, quiero ver los dos dictámenes firmados para el mismo caso y elegir cuál queda vigente, para que el caso tenga un único dictamen válido sin perder el otro. |
| Módulo | Dictaminación |
| Requisitos relacionados | RF-21, RF-59 |

### Criterios de aceptación

1. Dado que dos ingenieros dictaminaron el mismo caso (uno de ellos sin señal), la solicitud pasa a Pendiente-revisión y no se descarta ninguno de los dos dictámenes.
2. Dado que soy Jefe, cuando abro el detalle del caso, veo ambos dictámenes con autor, fecha de firma y contenido.
3. Cuando elijo uno, ese queda vigente, el otro queda en el historial como no vigente y la solicitud vuelve a Dictaminada.
4. La elección queda registrada con quién la hizo, fecha y hora.

### Validación INVEST

| Criterio | ¿Se cumple? | Observación |
|----------|-------------|-------------|
| Independiente | Parcial | Depende de HU-06 y HU-09 para que existan dos dictámenes; se prueba cargando dos dictámenes del mismo caso. |
| Negociable | Sí | La forma de mostrar los dos dictámenes (lado a lado o en pestañas) se define en la UI sin cambiar el valor. |
| Valiosa | Sí | Se verifica con el criterio 3: el caso queda con un solo dictamen vigente y nada se pierde. |
| Estimable | Sí | Es una pantalla de comparación y una acción de elegir, sobre datos que ya existen. |
| Pequeña | Sí | No incluye volver a dictaminar ni notificaciones a los ingenieros. |
| Verificable | Sí | Se comprueba con los criterios 3 y 4: un dictamen vigente, el otro no vigente y la elección registrada. |

---

## HU-18 — Desbloquear un captor bloqueado

| Campo | Detalle |
|-------|---------|
| Historia | Como Administrador, quiero desbloquear un captor bloqueado por intentos fallidos identificándolo con el código de su pantalla, para que el ingeniero pueda volver a trabajar. |
| Módulo | Autenticación y gestión de usuarios |
| Requisitos relacionados | RF-52, RF-54, RF-60 |

### Criterios de aceptación

1. Dado que un captor se bloqueó tras 5 intentos fallidos, su pantalla de bloqueo muestra un código del dispositivo.
2. Dado que soy Administrador, cuando ingreso ese código en Gestión de usuarios, veo el captor y puedo desbloquearlo.
3. Cuando el captor tiene conexión, el desbloqueo se aplica y el ingeniero puede volver a ingresar.
4. El desbloqueo queda registrado en el log de auditoría (quién, cuándo y qué captor).

### Validación INVEST

| Criterio | ¿Se cumple? | Observación |
|----------|-------------|-------------|
| Independiente | Parcial | Se apoya en el bloqueo de HU-09; se prueba bloqueando un captor de prueba. |
| Negociable | Sí | Si más adelante se prefiere un desbloqueo automático por tiempo, se cambia sin tocar el resto. |
| Valiosa | Sí | Se verifica con el criterio 3: sin esto, un ingeniero bloqueado no podría trabajar. |
| Estimable | Sí | Es un buscador por código y una acción de confirmar. |
| Pequeña | Sí | No incluye la revocación por pérdida o robo, que ya está en HU-02. |
| Verificable | Sí | Se comprueba con los criterios 2 a 4. |
