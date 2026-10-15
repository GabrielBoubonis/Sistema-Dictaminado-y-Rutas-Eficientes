# Casos de uso

## Diagrama general

_El código PlantUML se encuentra en `diagramas/casos-de-uso.puml`._
_Visualizar en [plantuml.com](https://www.plantuml.com/plantuml/uml/)._

### Actores identificados

**Actores principales** (inician los casos de uso, son los roles del sistema):

- **Operador** — ingeniero de campo. Consulta solicitudes, arma rutas, dictamina.
- **Jefe** — mismo acceso operativo que el Operador, más el dashboard y la resolución de dictámenes en conflicto.
- **Administrador** — personal del CIL. Gestiona usuarios y roles, desbloquea captores y revisa los casos
  que quedan "para revisar"; en el resto del sistema se comporta como lector.
- **Lector** — consulta pasiva del dashboard y del protocolo por tormenta.

**Actores secundarios** (sistemas externos que participan, pero no inician):

- **SUA (Sistema Único de Atención)** — provee las solicitudes derivadas y recibe los datos
  complementarios del dictamen.
- **Autenticación Institucional** — valida la vigencia del usuario en la institución.

### Relaciones principales

| Relación | Casos involucrados | Motivo |
|---|---|---|
| `<<include>>` | CU-06 incluye CU-07 | Todo dictamen emitido debe sincronizarse con el SUA; no es opcional. |
| `<<include>>` | CU-04 incluye CU-03 | Para generar una ruta, el sistema siempre necesita consultar las solicitudes disponibles. |
| `<<include>>` | CU-12 incluye CU-04 | El protocolo por tormenta reutiliza el mecanismo de generación de ruta, con criterios propios. |
| `<<extend>>` | CU-09 extiende CU-06 | Solo se consulta el dictamen anterior si la solicitud está en estado Pendiente-revisión. |
| `<<extend>>` | CU-10 extiende CU-06 | Solo aplica si el dispositivo no tiene conexión al momento de firmar. |

CU-13, CU-14, CU-15 y CU-16 no participan de relaciones `<<include>>`/`<<extend>>`: son casos de uso independientes. CU-13, CU-14 y CU-16 son accesibles únicamente para el Administrador; CU-15, para el Jefe.

---

## CU-01 — Iniciar sesión

| Campo | Detalle |
|-------|---------|
| Identificador | CU-01 |
| Nombre | Iniciar sesión |
| Descripción | Un usuario del sistema se identifica con sus credenciales para acceder a las funciones habilitadas según su rol. |
| Actores | Principal: Operador, Jefe, Administrador, Lector / Secundario: Autenticación Institucional |
| Precondiciones | El usuario tiene una cuenta creada en el sistema por el Administrador. |
| Postcondiciones | Éxito: el usuario queda autenticado y accede a las funciones de su rol. / Fallo: el acceso es denegado y el usuario permanece fuera del sistema. |

### Secuencia normal

| # | Acción (actor) | Reacción (sistema) |
|---|----------------|--------------------|
| 1 | El usuario accede a la pantalla de ingreso. | El sistema muestra el formulario de usuario y contraseña. |
| 2 | El usuario ingresa sus credenciales y confirma. | El sistema verifica que las credenciales correspondan a un usuario registrado.<br>• 2.1 Si las credenciales no son válidas, el sistema deberá denegar el acceso y mostrar un mensaje de error genérico (RF-50), sin indicar si el usuario existe o no. |
| 3 | — | El sistema consulta a la Autenticación Institucional que el usuario siga vigente en la institución.<br>• 3.1 Si el usuario no está vigente, el sistema deberá denegar el acceso mostrando el mismo mensaje genérico del paso 2.1 (RF-50). |
| 4 | — | El sistema habilita el acceso y muestra el menú correspondiente al rol del usuario. |

### Excepciones

| # | Situación | Respuesta del sistema |
|---|-----------|-----------------------|
| E1 | La Autenticación Institucional no responde. | El sistema informa que el servicio de autenticación no está disponible y que se intente nuevamente en un rato, con un mensaje distinto del error genérico de credenciales (RF-50); esta situación no cuenta como intento fallido (RF-52, RNF-19). |
| E2 | El usuario permanece 30 minutos sin interactuar con el sistema. | El sistema cierra la sesión automáticamente y solicita un nuevo ingreso. |
| E3 | El usuario no tiene conexión y su sesión se cerró por inactividad (E2). | Si ya había ingresado con conexión ese día, no pasaron 7 días desde su primer ingreso y el captor no fue revocado, el sistema permite reanudar la sesión con la contraseña local, sin consultar a la Autenticación Institucional (RF-57); al recuperar la conexión revalida al usuario y, si ya no está vigente, cierra la sesión. Si no se cumple alguna condición, indica que debe buscar señal para ingresar. Los intentos fallidos cuentan para el bloqueo local (RF-52). |

| Campo | Detalle |
|-------|---------|
| Rendimiento | El sistema deberá completar los pasos 2 al 4 en un tiempo breve, sin que el usuario perciba demora. |
| Frecuencia | Una media de 5 a 10 veces al día (al menos una por usuario por jornada). |
| Importancia | Vital |
| Urgencia | Inmediatamente |

---

## CU-02 — Gestionar usuarios y roles

| Campo | Detalle |
|-------|---------|
| Identificador | CU-02 |
| Nombre | Gestionar usuarios y roles |
| Descripción | El Administrador del CIL da de alta, modifica o da de baja usuarios del sistema y les asigna un rol, para controlar el acceso al sistema. |
| Actores | Principal: Administrador / Secundario: — |
| Precondiciones | El Administrador inició sesión (CU-01). |
| Postcondiciones | Éxito: el usuario queda creado, modificado o dado de baja, con su rol asignado, y la acción queda registrada en el log de auditoría (CU-13). / Fallo: no se altera el padrón de usuarios existente. |

### Secuencia normal

| # | Acción (actor) | Reacción (sistema) |
|---|----------------|--------------------|
| 1 | El Administrador accede al apartado de gestión de usuarios. | El sistema muestra el listado de usuarios existentes con su rol. |
| 2 | El Administrador elige crear un usuario nuevo. | El sistema muestra el formulario de alta. |
| 3 | El Administrador completa los datos, define una contraseña y selecciona un rol. | El sistema verifica que la contraseña cumpla las reglas de complejidad.<br>• 3.1 Si la contraseña no cumple los requisitos, el sistema deberá rechazar el alta e indicar qué requisito falta. |
| 4 | El Administrador confirma el alta. | El sistema registra el usuario con el rol asignado y lo muestra en el listado.<br>• 4.1 El sistema deberá registrar la acción en el log de auditoría (usuario que la realizó, acción, fecha y hora), de forma inmutable (RF-54). |

### Excepciones

| # | Situación | Respuesta del sistema |
|---|-----------|-----------------------|
| E1 | El nombre de usuario generado ya existe. | El sistema agrega un número incremental al identificador para diferenciarlo. |
| E2 | Un usuario perdió su contraseña y el Administrador la restablece. | El sistema genera una nueva contraseña y deja sin efecto la anterior. |
| E3 | Se da de baja un usuario con sesión activa. | El sistema le impide continuar operando y le niega el siguiente ingreso. |
| E4 | El Administrador reporta un captor como perdido o robado. | El sistema revoca de forma remota la sesión y los datos locales de ese dispositivo en cuanto vuelve a tener conexión, y registra la acción en el log de auditoría (RF-52, RF-54). |

| Campo | Detalle |
|-------|---------|
| Rendimiento | El sistema deberá completar los pasos 3 y 4 sin demora perceptible. |
| Frecuencia | Baja: unas pocas veces al mes, ante altas, bajas o cambios de rol del personal. |
| Importancia | Vital |
| Urgencia | Hay presión |

---

## CU-03 — Consultar solicitudes derivadas

| Campo | Detalle |
|-------|---------|
| Identificador | CU-03 |
| Nombre | Consultar solicitudes derivadas |
| Descripción | Un ingeniero consulta el listado de solicitudes de arbolado derivadas a la Dirección Técnica, para conocer qué casos están disponibles para dictaminar. |
| Actores | Principal: Operador, Jefe / Secundario: SUA |
| Precondiciones | El usuario inició sesión (CU-01) y el sistema tiene conexión con el SUA. |
| Postcondiciones | Éxito: el usuario visualiza las solicitudes derivadas con su identificador y estado. / Fallo: el listado no se muestra y el usuario es informado del motivo. |

### Secuencia normal

| # | Acción (actor) | Reacción (sistema) |
|---|----------------|--------------------|
| 1 | El usuario accede al apartado de solicitudes. | El sistema consulta al SUA las solicitudes de arbolado derivadas a la Dirección Técnica. |
| 2 | — | El sistema muestra el listado con el identificador de cada solicitud (Número de SUA - Año) y su estado.<br>• 2.1 Si una solicitud fue re-derivada por vencimiento, el sistema deberá mostrarla en estado Pendiente-revisión.<br>• 2.2 Si una solicitud está etiquetada como emergencia por tormenta, el sistema deberá excluirla de este listado y mostrarla únicamente en el protocolo por tormenta (CU-12). |
| 3 | El usuario selecciona una solicitud. | El sistema muestra el detalle técnico del caso, sin datos personales del vecino. |

### Excepciones

| # | Situación | Respuesta del sistema |
|---|-----------|-----------------------|
| E1 | El SUA no responde o no está disponible. | El sistema informa que no puede obtener las solicitudes en este momento y sugiere reintentar. |
| E2 | No hay solicitudes derivadas pendientes. | El sistema muestra el listado vacío con un mensaje aclaratorio. |
| E3 | Una solicitud no pudo ubicarse en el mapa (la geocodificación falló al derivarla). | El sistema la muestra igual en el listado y permite dictaminarla desde ahí; la excluye del armado automático de rutas y reintenta ubicarla solo cada hora (RF-62). |

| Campo | Detalle |
|-------|---------|
| Rendimiento | El sistema deberá mostrar el listado del paso 2 en un tiempo acotado, aun con la totalidad de solicitudes pendientes. |
| Frecuencia | Varias veces al día por cada ingeniero, al inicio de la jornada y entre visitas. |
| Importancia | Vital |
| Urgencia | Inmediatamente |

---

## CU-04 — Generar ruta de trabajo

| Campo | Detalle |
|-------|---------|
| Identificador | CU-04 |
| Nombre | Generar ruta de trabajo |
| Descripción | Un ingeniero genera su ruta de trabajo diaria seleccionando los criterios con los que quiere organizar su jornada. |
| Actores | Principal: Operador, Jefe / Secundario: — |
| Precondiciones | El usuario inició sesión (CU-01), tiene conexión a internet y existen solicitudes pendientes disponibles. |
| Postcondiciones | Éxito: queda armada una ruta con solicitudes reservadas para ese ingeniero, no disponibles para otras rutas. / Fallo: no se genera ninguna ruta y las solicitudes siguen disponibles para todos. |

### Secuencia normal

| # | Acción (actor) | Reacción (sistema) |
|---|----------------|--------------------|
| 1 | El usuario accede al apartado de rutas. | El sistema muestra las opciones de criterios disponibles. |
| 2 | El usuario define los criterios: un distrito como filtro, cantidad por nivel de prioridad, una zona señalada en el mapa y el modo de desplazamiento (a pie o en vehículo). | El sistema toma los criterios indicados.<br>• 2.1 Si el usuario no indica distrito, el sistema deberá considerar todos los distritos y armar la ruta con el resto de los criterios seleccionados.<br>• 2.2 El modo de desplazamiento es obligatorio, ya que determina cómo se calcula el tiempo y la distancia del recorrido. |
| 3 | El usuario confirma la generación de la ruta. | El sistema selecciona las solicitudes pendientes que cumplen los criterios, excluyendo las que ya forman parte de la ruta activa de otro ingeniero.<br>• 3.1 Si la cantidad de solicitudes candidatas supera el cupo indicado, el sistema deberá seleccionar cuáles incluir combinando antigüedad (preferencia a las más antiguas) y eficiencia del recorrido resultante. |
| 4 | — | El sistema calcula el orden de visita minimizando tiempo y distancia según el modo de desplazamiento elegido, partiendo de la sede de la Dirección General de Parques y Paseos, arma la ruta ordenada, la muestra al usuario y reserva esas solicitudes. |

### Excepciones

| # | Situación | Respuesta del sistema |
|---|-----------|-----------------------|
| E1 | El dispositivo no tiene conexión a internet. | El sistema no permite generar la ruta e informa que esta acción requiere conexión. |
| E2 | No hay solicitudes disponibles que cumplan los criterios indicados. | El sistema informa que no se encontraron casos y permite modificar los criterios. |
| E3 | Todas las solicitudes que cumplen los criterios ya están reservadas en rutas de otros ingenieros. | El sistema informa la situación y sugiere ampliar los criterios. |

| Campo | Detalle |
|-------|---------|
| Rendimiento | El sistema deberá completar los pasos 3 y 4 en un tiempo razonable, considerando que involucra el cálculo de un recorrido. |
| Frecuencia | Una media de una vez al día por ingeniero, con eventuales regeneraciones. |
| Importancia | Vital |
| Urgencia | Inmediatamente |

---

## CU-05 — Restablecer ruta de trabajo

| Campo | Detalle |
|-------|---------|
| Identificador | CU-05 |
| Nombre | Restablecer ruta de trabajo |
| Descripción | Un ingeniero descarta su ruta activa para poder armar una nueva, liberando las solicitudes que no alcanzó a dictaminar. |
| Actores | Principal: Operador, Jefe / Secundario: — |
| Precondiciones | El usuario tiene una ruta activa generada (CU-04). |
| Postcondiciones | Éxito: la ruta queda descartada y las solicitudes no dictaminadas vuelven a estar disponibles para cualquier ingeniero. / Fallo: la ruta se mantiene activa sin cambios. |

### Secuencia normal

| # | Acción (actor) | Reacción (sistema) |
|---|----------------|--------------------|
| 1 | El usuario accede a su ruta activa. | El sistema muestra las solicitudes de la ruta, indicando cuáles ya fueron dictaminadas. |
| 2 | El usuario selecciona la opción de restablecer. | El sistema solicita confirmación, advirtiendo que se descartará la ruta completa. |
| 3 | El usuario confirma. | El sistema descarta la ruta y libera las solicitudes no dictaminadas, dejándolas disponibles para otras rutas. |
| 4 | — | El sistema ofrece al usuario generar una nueva ruta (CU-04). |

### Excepciones

| # | Situación | Respuesta del sistema |
|---|-----------|-----------------------|
| E1 | Llegan las 18:00 hs y el usuario no restableció ni completó su ruta. | El sistema libera automáticamente todas las solicitudes no dictaminadas de la ruta. |
| E2 | El usuario intenta restablecer una ruta en la que ya dictaminó todos los casos. | El sistema informa que no hay solicitudes para liberar y permite generar una ruta nueva. |

| Campo | Detalle |
|-------|---------|
| Rendimiento | El sistema deberá liberar las solicitudes del paso 3 de forma inmediata, de modo que queden disponibles para otros ingenieros sin demora. |
| Frecuencia | Ocasional: algunas veces por semana, ante cambios de prioridad durante la jornada. |
| Importancia | Importante |
| Urgencia | Hay presión |

---

## CU-06 — Emitir dictamen técnico

| Campo | Detalle |
|-------|---------|
| Identificador | CU-06 |
| Nombre | Emitir dictamen técnico |
| Descripción | Un ingeniero completa y firma el dictamen técnico de una solicitud, dejando registrada la intervención que corresponde sobre el ejemplar. |
| Actores | Principal: Operador, Jefe / Secundario: SUA |
| Precondiciones | El usuario inició sesión (CU-01) y la solicitud está en estado Pendiente o Pendiente-revisión. |
| Postcondiciones | Éxito: el dictamen queda firmado y almacenado, la solicitud pasa a estado Dictaminada y sus datos se envían al SUA (CU-07). / Fallo: no se registra ningún dictamen y la solicitud permanece pendiente. |

### Secuencia normal

| # | Acción (actor) | Reacción (sistema) |
|---|----------------|--------------------|
| 1 | El usuario selecciona una solicitud de su ruta. | El sistema muestra el formulario de dictamen en blanco, junto al detalle técnico del caso.<br>• 1.1 Si la solicitud está en estado Pendiente-revisión, el sistema deberá ofrecer consultar el dictamen anterior (CU-09). |
| 2 | El usuario registra las características del ejemplar y la intervención que corresponde. | El sistema valida que los datos obligatorios estén completos.<br>• 2.1 Si faltan datos obligatorios, el sistema deberá señalar los campos incompletos y no permitir el envío.<br>• 2.2 Si el usuario marca "Extracción", el sistema deberá deshabilitar los campos de trabajos en la parte aérea y en la parte subterránea, por ser incongruentes con la extracción del ejemplar.<br>• 2.3 Si no se adjuntó al menos una fotografía del ejemplar, el sistema deberá impedir el envío y señalar que la fotografía es obligatoria.<br>• 2.4 Si el usuario marca "Sin trabajo", el sistema deberá deshabilitar Extracción y los trabajos aéreos y subterráneos (y a la inversa); si no hay ninguna intervención marcada ni "Sin trabajo", deberá impedir el envío e indicar que el dictamen debe decir algo (RF-61). |
| 3 | El usuario confirma el envío del dictamen. | El sistema verifica que la solicitud no haya sido dictaminada por otro ingeniero mientras tanto.<br>• 3.1 Si ya existe un dictamen activo para ese ejemplar, el sistema deberá rechazar el envío e informar que el caso ya fue resuelto.<br>• 3.2 El sistema deberá exigir un segundo factor de autenticación (verificación biométrica del dispositivo, WebAuthn) antes de continuar (RF-51). |
| 4 | El usuario completa el segundo factor de autenticación. | El sistema verifica el segundo factor.<br>• 4.1 Si el segundo factor es incorrecto o no se completa, el sistema deberá cancelar la firma sin almacenar el dictamen. |
| 5 | — | El sistema firma el dictamen dejando registro de quién lo emitió y cuándo, y lo almacena. |
| 6 | — | El sistema envía los datos del dictamen al SUA (CU-07) y actualiza el estado de la solicitud a Dictaminada. |

### Excepciones

| # | Situación | Respuesta del sistema |
|---|-----------|-----------------------|
| E1 | El dispositivo no tiene conexión al momento de firmar. | El sistema firma y guarda el dictamen en el dispositivo, en estado pendiente de sincronizar (CU-10). |
| E2 | El SUA no acepta la actualización. | El sistema conserva el dictamen firmado en estado pendiente de sincronizar y reintenta el envío automáticamente (CU-07). |
| E3 | La sesión del usuario venció durante la carga del dictamen. | El sistema solicita un nuevo ingreso sin descartar los datos cargados ni la ruta armada. |

| Campo | Detalle |
|-------|---------|
| Rendimiento | El sistema deberá completar los pasos 3 al 5 sin que el ingeniero deba esperar frente al ejemplar. |
| Frecuencia | Hasta 10 veces al día por ingeniero (aproximadamente 70 diarias en total). |
| Importancia | Vital |
| Urgencia | Inmediatamente |

---

## CU-07 — Sincronizar dictamen con el SUA

| Campo | Detalle |
|-------|---------|
| Identificador | CU-07 |
| Nombre | Sincronizar dictamen con el SUA |
| Descripción | El sistema envía al SUA los datos complementarios de un dictamen ya firmado, para que la solicitud quede actualizada en el circuito general. |
| Actores | Principal: Operador, Jefe (de forma indirecta, al emitir el dictamen) / Secundario: SUA |
| Precondiciones | Existe al menos un dictamen firmado, con o sin envío previo fallido. |
| Postcondiciones | Éxito: el SUA registra los datos complementarios y el dictamen queda marcado como sincronizado. / Fallo: el dictamen permanece firmado localmente en estado pendiente de sincronizar. |

### Secuencia normal

| # | Acción (actor) | Reacción (sistema) |
|---|----------------|--------------------|
| 1 | — | El sistema detecta un dictamen firmado pendiente de enviar y verifica que haya conexión disponible. |
| 2 | — | El sistema recalcula el hash de firma sobre el contenido del dictamen y lo compara contra el hash generado en el dispositivo al momento de firmar.<br>• 2.1 Si los hashes no coinciden, el sistema deberá rechazar la sincronización, marcar el dictamen como "integridad no verificada" y dejarlo en el apartado "Para revisar" del Administrador (RF-53, RF-58), sin continuar con el paso 3. |
| 3 | — | El sistema envía al SUA los datos complementarios correspondientes a esa solicitud. |
| 4 | — | El sistema recibe la confirmación del SUA y marca el dictamen como sincronizado.<br>• 4.1 Si el envío no se confirma, el sistema deberá mantener el dictamen en estado pendiente de sincronizar y programar un nuevo intento. |
| 5 | — | El sistema actualiza el indicador de sincronización visible para el usuario. |

### Excepciones

| # | Situación | Respuesta del sistema |
|---|-----------|-----------------------|
| E1 | El SUA está caído o no responde. | El sistema distingue esta situación de la falta de conexión general del dispositivo, conserva el dictamen firmado y reintenta automáticamente con espera creciente entre intentos, sin intervención del usuario (RNF-17). |
| E2 | El dispositivo no recupera conexión durante toda la jornada. | El sistema mantiene los dictámenes en cola y los envía apenas haya conexión, incluso en jornadas posteriores. |
| E3 | El hash recalculado en el paso 2 no coincide con el generado al firmar. | El sistema rechaza la sincronización, conserva el dictamen marcado como "integridad no verificada" y lo deja en el apartado "Para revisar" del Administrador (RF-58), en lugar de darlo por sincronizado. |

| Campo | Detalle |
|-------|---------|
| Rendimiento | El sistema deberá realizar el envío del paso 2 en segundo plano, sin bloquear el trabajo del ingeniero. |
| Frecuencia | Una vez por cada dictamen emitido (aproximadamente 70 diarias). |
| Importancia | Vital |
| Urgencia | Inmediatamente |

---

## CU-08 — Descargar dictamen en formato imprimible

| Campo | Detalle |
|-------|---------|
| Identificador | CU-08 |
| Nombre | Descargar dictamen en formato imprimible |
| Descripción | Un ingeniero descarga un dictamen firmado en formato PDF, para poder imprimirlo como documento legal cuando sea requerido. |
| Actores | Principal: Operador, Jefe / Secundario: — |
| Precondiciones | Existe un dictamen firmado para la solicitud consultada. |
| Postcondiciones | Éxito: el usuario obtiene un archivo con el contenido completo del dictamen y sus datos de firma. / Fallo: no se genera el archivo y el dictamen permanece disponible en el sistema. |

### Secuencia normal

| # | Acción (actor) | Reacción (sistema) |
|---|----------------|--------------------|
| 1 | El usuario accede al detalle de una solicitud dictaminada. | El sistema muestra el dictamen firmado y la opción de descarga. |
| 2 | El usuario selecciona la opción de descargar. | El sistema genera el documento con el contenido del dictamen y los datos de la firma (autor y fecha de emisión). |
| 3 | — | El sistema entrega el archivo al usuario para su descarga. |

### Excepciones

| # | Situación | Respuesta del sistema |
|---|-----------|-----------------------|
| E1 | El dictamen solicitado corresponde a un caso con varios dictámenes en su historial. | El sistema permite descargar cualquiera de ellos, identificando a cuál corresponde. |
| E2 | El documento no puede generarse. | El sistema informa el inconveniente y mantiene el dictamen accesible para reintentar. |

| Campo | Detalle |
|-------|---------|
| Rendimiento | El sistema deberá generar el documento del paso 2 sin demora perceptible para el usuario. |
| Frecuencia | Ocasional: solo cuando se requiere el documento legal impreso. |
| Importancia | Importante |
| Urgencia | Puede esperar |

---

## CU-09 — Consultar dictamen anterior

| Campo | Detalle |
|-------|---------|
| Identificador | CU-09 |
| Nombre | Consultar dictamen anterior |
| Descripción | Un ingeniero consulta el dictamen previo de un caso re-derivado por vencimiento, para conocer qué se evaluó la vez anterior antes de emitir el nuevo. |
| Actores | Principal: Operador, Jefe / Secundario: — |
| Precondiciones | La solicitud está en estado Pendiente-revisión y tiene al menos un dictamen en su historial. |
| Postcondiciones | Éxito: el usuario visualiza el contenido del dictamen anterior y quién lo emitió. / Fallo: el formulario del nuevo dictamen permanece disponible sin la información de referencia. |

### Secuencia normal

| # | Acción (actor) | Reacción (sistema) |
|---|----------------|--------------------|
| 1 | El usuario abre una solicitud en estado Pendiente-revisión. | El sistema muestra el formulario del nuevo dictamen en blanco, junto a la opción de consultar el dictamen anterior. |
| 2 | El usuario selecciona consultar el dictamen anterior. | El sistema muestra el contenido completo del dictamen previo y el usuario que lo emitió, sin precargarlo en el formulario. |
| 3 | El usuario cierra la consulta. | El sistema regresa al formulario del nuevo dictamen, conservando lo que el usuario ya haya cargado. |

### Excepciones

| # | Situación | Respuesta del sistema |
|---|-----------|-----------------------|
| E1 | El caso tiene más de un dictamen en su historial. | El sistema muestra el historial completo, identificando la fecha y el autor de cada uno. |
| E2 | El dispositivo no tiene conexión y el dictamen anterior no está disponible localmente. | El sistema informa que la consulta requiere conexión, sin impedir la carga del nuevo dictamen. |

| Campo | Detalle |
|-------|---------|
| Rendimiento | El sistema deberá mostrar el dictamen anterior del paso 2 sin demora perceptible. |
| Frecuencia | Poco frecuente: solo ante casos re-derivados por vencimiento, situación excepcional. |
| Importancia | Importante |
| Urgencia | Puede esperar |

---

## CU-10 — Dictaminar sin conexión

| Campo | Detalle |
|-------|---------|
| Identificador | CU-10 |
| Nombre | Dictaminar sin conexión |
| Descripción | Un ingeniero completa y firma un dictamen en un lugar sin señal, y el sistema lo conserva para enviarlo automáticamente al recuperar conexión. |
| Actores | Principal: Operador, Jefe / Secundario: SUA |
| Precondiciones | El usuario generó previamente su ruta con conexión y tiene la aplicación instalada en el dispositivo. |
| Postcondiciones | Éxito: el dictamen queda firmado y guardado en el dispositivo, en estado pendiente de sincronizar. / Fallo: el dictamen no se registra y la solicitud permanece pendiente en la ruta del ingeniero. |

### Secuencia normal

| # | Acción (actor) | Reacción (sistema) |
|---|----------------|--------------------|
| 1 | El usuario abre una solicitud de su ruta estando sin señal. | El sistema muestra el detalle del caso y el formulario de dictamen, ya disponibles en el dispositivo. |
| 2 | El usuario completa el dictamen y confirma el envío. | El sistema firma el dictamen y lo guarda en el dispositivo en estado pendiente de sincronizar. |
| 3 | — | El sistema actualiza el indicador de sincronización, mostrando la cantidad de dictámenes en espera. |
| 4 | El usuario recupera señal. | El sistema envía automáticamente los dictámenes pendientes al SUA (CU-07), sin intervención del usuario. |

### Excepciones

| # | Situación | Respuesta del sistema |
|---|-----------|-----------------------|
| E1 | El usuario intenta generar una ruta nueva estando sin conexión. | El sistema no permite la operación e informa que esa acción requiere conexión. |
| E2 | La señal es intermitente durante el envío. | El sistema no bloquea la interfaz: mantiene el dictamen en cola y reintenta cuando la conexión se estabiliza. |
| E3 | El usuario termina la jornada con dictámenes sin sincronizar. | El sistema los conserva en el dispositivo y los envía en cuanto haya conexión, aun en jornadas posteriores. |
| E4 | La sesión se cierra por inactividad estando sin señal. | El sistema permite reanudarla con la contraseña local si se cumplen las condiciones de CU-01, excepción E3 (RF-57), para que el ingeniero pueda seguir dictaminando. |
| E5 | Al sincronizar, el dictamen firmado sin conexión resulta ser el segundo para un caso que otro ingeniero ya dictaminó. | El sistema no lo descarta: conserva ambos dictámenes, pasa la solicitud a Pendiente-revisión y deja la decisión a un Jefe (CU-15). |

| Campo | Detalle |
|-------|---------|
| Rendimiento | El sistema deberá completar el paso 2 sin depender de la red, de modo que el ingeniero no perciba diferencia respecto del trabajo con conexión. |
| Frecuencia | Variable según la zona: se espera que ocurra en una porción menor de los dictámenes diarios. |
| Importancia | Vital |
| Urgencia | Inmediatamente |

---

## CU-11 — Consultar dashboard de métricas

| Campo | Detalle |
|-------|---------|
| Identificador | CU-11 |
| Nombre | Consultar dashboard de métricas |
| Descripción | Un responsable consulta las métricas de solicitudes derivadas, dictaminadas y sin dictaminar, para hacer seguimiento del trabajo del área por período. |
| Actores | Principal: Jefe, Administrador, Lector / Secundario: — |
| Precondiciones | El usuario inició sesión (CU-01) con un rol habilitado para ver el dashboard. |
| Postcondiciones | Éxito: el usuario visualiza las métricas del período seleccionado. / Fallo: las métricas no se muestran y el usuario es informado del motivo. |

### Secuencia normal

| # | Acción (actor) | Reacción (sistema) |
|---|----------------|--------------------|
| 1 | El usuario accede al dashboard. | El sistema muestra la cantidad de solicitudes derivadas, dictaminadas y sin dictaminar. |
| 2 | El usuario selecciona un período (mes o año). | El sistema recalcula y muestra las métricas correspondientes a ese período.<br>• 2.1 Si una solicitud fue re-derivada por vencimiento, el sistema deberá contarla como un evento independiente en el período en que ocurrió. |
| 3 | El usuario consulta el desglose de solicitudes de tormenta. | El sistema muestra las métricas exclusivas de emergencias climáticas, además de estar incluidas en el total general. |

### Excepciones

| # | Situación | Respuesta del sistema |
|---|-----------|-----------------------|
| E1 | No hay datos registrados para el período seleccionado. | El sistema muestra las métricas en cero, aclarando que no hubo actividad en ese período. |
| E2 | Un usuario sin rol habilitado intenta acceder al dashboard. | El sistema le niega el acceso a la sección. |

| Campo | Detalle |
|-------|---------|
| Rendimiento | El sistema deberá mostrar las métricas de los pasos 1 y 2 en un tiempo acotado, aun considerando el historial acumulado. |
| Frecuencia | Una media de varias veces por semana, según la necesidad de seguimiento de la Dirección. |
| Importancia | Importante |
| Urgencia | Puede esperar |

---

## CU-12 — Atender protocolo por tormenta

| Campo | Detalle |
|-------|---------|
| Identificador | CU-12 |
| Nombre | Atender protocolo por tormenta |
| Descripción | Un ingeniero accede al apartado de emergencias climáticas y genera una ruta con las solicitudes de tormenta más antiguas, para resolverlas con prioridad máxima. |
| Actores | Principal: Operador, Jefe (gestión) / Administrador, Lector (solo consulta) / Secundario: SUA |
| Precondiciones | El usuario inició sesión (CU-01) y existen solicitudes derivadas con la etiqueta de emergencia por tormenta. |
| Postcondiciones | Éxito: queda armada una ruta de tormenta con las solicitudes más antiguas reservadas para ese ingeniero. / Fallo: no se genera ruta y las solicitudes de tormenta siguen disponibles. |

### Secuencia normal

| # | Acción (actor) | Reacción (sistema) |
|---|----------------|--------------------|
| 1 | El usuario observa el indicador animado que señala la existencia de emergencias por tormenta. | El sistema destaca el apartado de protocolo por tormenta como prioridad máxima. |
| 2 | El usuario accede al protocolo por tormenta. | El sistema muestra exclusivamente las solicitudes etiquetadas como emergencia climática, que no figuran en el listado general.<br>• 2.1 Si el usuario tiene rol Administrador o Lector, el sistema deberá permitir únicamente la consulta, sin opción de generar ruta. |
| 3 | El usuario indica la cantidad de solicitudes que quiere atender. | El sistema selecciona esa cantidad de solicitudes, priorizando las más antiguas primero y excluyendo las reservadas en rutas de otros ingenieros. |
| 4 | El usuario confirma. | El sistema arma la ruta de tormenta, la muestra y reserva esas solicitudes. |
| 5 | El usuario dictamina cada solicitud de la ruta. | El sistema procesa el dictamen con el mismo formulario que cualquier otro caso (CU-06). |

### Excepciones

| # | Situación | Respuesta del sistema |
|---|-----------|-----------------------|
| E1 | El dispositivo no tiene conexión al intentar generar la ruta de tormenta. | El sistema no permite la operación e informa que esa acción requiere conexión. |
| E2 | La cantidad solicitada supera las solicitudes de tormenta disponibles. | El sistema arma la ruta con todas las disponibles e informa la cantidad efectivamente incluida. |
| E3 | No hay solicitudes de tormenta pendientes. | El sistema muestra el apartado vacío y no exhibe el indicador de prioridad. |

| Campo | Detalle |
|-------|---------|
| Rendimiento | El sistema deberá completar los pasos 3 y 4 con la misma agilidad que una ruta común, dada la urgencia del escenario. |
| Frecuencia | Excepcional: solo ante eventos climáticos, con picos concentrados de solicitudes. |
| Importancia | Vital |
| Urgencia | Inmediatamente |

---

## CU-13 — Consultar registro de auditoría

| Campo | Detalle |
|-------|---------|
| Identificador | CU-13 |
| Nombre | Consultar registro de auditoría |
| Descripción | El Administrador consulta el log de auditoría de altas, bajas y cambios de rol de usuarios, y de desbloqueos o revocaciones de captores, para revisar quién hizo qué cambio y cuándo. |
| Actores | Principal: Administrador / Secundario: — |
| Precondiciones | El Administrador inició sesión (CU-01). |
| Postcondiciones | Éxito: el Administrador visualiza los eventos de auditoría según los filtros aplicados. / Fallo: no se muestra el listado y el Administrador es informado del motivo. |

### Secuencia normal

| # | Acción (actor) | Reacción (sistema) |
|---|----------------|--------------------|
| 1 | El Administrador accede al apartado de auditoría. | El sistema muestra el listado de eventos registrados (usuario, acción, fecha y hora), más recientes primero. |
| 2 | El Administrador aplica un filtro por usuario, tipo de acción o rango de fechas. | El sistema actualiza el listado según el filtro aplicado. |

### Excepciones

| # | Situación | Respuesta del sistema |
|---|-----------|-----------------------|
| E1 | No hay eventos que cumplan el filtro aplicado. | El sistema muestra el listado vacío, indicando que no hay resultados para ese filtro. |
| E2 | El rango de fechas es inválido (la fecha "desde" es posterior a la fecha "hasta"). | El sistema no aplica el filtro, conserva el listado anterior e informa que el rango de fechas es inválido para que lo corrija. |
| E3 | El registro de auditoría no se puede leer (por ejemplo, falla de la base de datos). | El sistema informa que no pudo cargar el registro y permite reintentar; no muestra datos parciales ni altera ningún evento. |

| Campo | Detalle |
|-------|---------|
| Rendimiento | El sistema deberá mostrar el listado del paso 1 sin demora perceptible, aun con un historial extenso de eventos. |
| Frecuencia | Baja: solo ante una revisión puntual o un incidente a investigar. |
| Importancia | Importante |
| Urgencia | Puede esperar |

---

## CU-14 — Revisar casos para revisar

| Campo | Detalle |
|-------|---------|
| Identificador | CU-14 |
| Nombre | Revisar casos para revisar |
| Descripción | El Administrador consulta los casos que el sistema no pudo procesar solo: dictámenes con integridad no verificada y registros del SUA rechazados por datos inválidos. |
| Actores | Principal: Administrador / Secundario: — |
| Precondiciones | El Administrador inició sesión (CU-01). |
| Postcondiciones | Éxito: el Administrador visualiza los casos pendientes de revisión con su detalle. / Fallo: no se muestra el listado y el Administrador es informado del motivo. |

### Secuencia normal

| # | Acción (actor) | Reacción (sistema) |
|---|----------------|--------------------|
| 1 | El Administrador accede al apartado "Para revisar" de su panel. | El sistema muestra el listado de casos: tipo (integridad no verificada o datos inválidos del SUA), solicitud afectada, fecha y motivo, más recientes primero (RF-58). |
| 2 | El Administrador abre un caso. | El sistema muestra su detalle (para un dictamen, el autor y la fecha de firma; para un registro del SUA, los campos rechazados y el motivo). La consulta es de solo lectura: el sistema no ofrece editar ni descartar el caso. |

### Excepciones

| # | Situación | Respuesta del sistema |
|---|-----------|-----------------------|
| E1 | No hay casos para revisar. | El sistema muestra el listado vacío con el mensaje "No hay casos para revisar". |
| E2 | El listado no se puede leer (por ejemplo, falla de la base de datos). | El sistema informa que no pudo cargarlo y permite reintentar; no muestra datos parciales. |

| Campo | Detalle |
|-------|---------|
| Rendimiento | El sistema deberá mostrar el listado del paso 1 sin demora perceptible. |
| Frecuencia | Baja: solo cuando aparecen casos rechazados. |
| Importancia | Importante |
| Urgencia | Puede esperar |

---

## CU-15 — Resolver dictámenes en conflicto

| Campo | Detalle |
|-------|---------|
| Identificador | CU-15 |
| Nombre | Resolver dictámenes en conflicto |
| Descripción | Un Jefe elige cuál de los dos dictámenes firmados para la misma solicitud queda vigente. |
| Actores | Principal: Jefe / Secundario: — |
| Precondiciones | El Jefe inició sesión (CU-01) y una solicitud está en Pendiente-revisión por tener dos dictámenes firmados (CU-10, excepción E5). |
| Postcondiciones | Éxito: un dictamen queda vigente y el otro queda en el historial como no vigente; la solicitud vuelve a Dictaminada. / Fallo: ambos dictámenes se conservan y la solicitud sigue en Pendiente-revisión. |

### Secuencia normal

| # | Acción (actor) | Reacción (sistema) |
|---|----------------|--------------------|
| 1 | El Jefe abre el detalle de una solicitud con dos dictámenes en conflicto. | El sistema muestra ambos dictámenes lado a lado, con autor, fecha de firma y contenido (RF-59). |
| 2 | El Jefe elige cuál queda vigente y confirma. | El sistema marca el elegido como vigente y el otro como no vigente, lo conserva en el historial, registra quién eligió, fecha y hora, y devuelve la solicitud a Dictaminada. |

### Excepciones

| # | Situación | Respuesta del sistema |
|---|-----------|-----------------------|
| E1 | El Jefe cierra la pantalla sin confirmar. | El sistema no cambia nada: ambos dictámenes siguen sin resolver. |
| E2 | Otro Jefe resolvió el conflicto mientras tanto. | El sistema informa que el caso ya fue resuelto y muestra el dictamen vigente. |

| Campo | Detalle |
|-------|---------|
| Rendimiento | El sistema deberá mostrar los dos dictámenes sin demora perceptible. |
| Frecuencia | Baja: solo cuando dos ingenieros dictaminan el mismo caso, en especial uno de ellos sin señal. |
| Importancia | Importante |
| Urgencia | Puede esperar |

---

## CU-16 — Desbloquear captor

| Campo | Detalle |
|-------|---------|
| Identificador | CU-16 |
| Nombre | Desbloquear captor |
| Descripción | El Administrador desbloquea un captor que quedó bloqueado tras 5 intentos de ingreso fallidos, identificándolo por el código que muestra su pantalla de bloqueo. |
| Actores | Principal: Administrador / Secundario: — |
| Precondiciones | El Administrador inició sesión (CU-01) y el captor fue bloqueado por RF-52. |
| Postcondiciones | Éxito: el captor queda desbloqueado (RF-60) y el desbloqueo queda registrado en el log de auditoría (CU-13). / Fallo: el captor sigue bloqueado. |

### Secuencia normal

| # | Acción (actor) | Reacción (sistema) |
|---|----------------|--------------------|
| 1 | El Administrador accede a Gestión de usuarios, sección "Captores bloqueados", e ingresa el código que le informa el ingeniero. | El sistema muestra el captor con ese código, el usuario asociado y la fecha del bloqueo. |
| 2 | El Administrador confirma el desbloqueo. | El sistema marca el captor como desbloqueado y registra la acción en el log de auditoría (usuario que la realizó, acción, fecha y hora; RF-54). |
| 3 | El ingeniero abre la app en el captor con conexión. | El sistema aplica el desbloqueo y permite un nuevo intento de ingreso. |

### Excepciones

| # | Situación | Respuesta del sistema |
|---|-----------|-----------------------|
| E1 | El código ingresado no corresponde a ningún captor bloqueado. | El sistema informa que no encontró un captor bloqueado con ese código y permite corregirlo. |
| E2 | El captor fue reportado como perdido o robado y ya se revocó (RF-52). | El sistema no permite desbloquearlo e indica que fue revocado. |

| Campo | Detalle |
|-------|---------|
| Rendimiento | El sistema deberá completar los pasos 1 y 2 sin demora perceptible. |
| Frecuencia | Baja: solo ante un bloqueo por intentos fallidos. |
| Importancia | Importante |
| Urgencia | Lo antes posible, porque hasta entonces el ingeniero no puede dictaminar con ese captor |
