# Requisitos del sistema

## Descripción del sistema

El sistema resuelve la etapa de dictaminación técnica de reclamos de arbolado público,
una vez que estos ya fueron derivados a la Dirección Técnica de Arbolado dentro del SUA
(Sistema Único de Atención). Permite a los ingenieros consultar las solicitudes asignadas,
armar una ruta de trabajo diaria, completar y firmar digitalmente el dictamen técnico
correspondiente, y sincronizar el resultado con el SUA. También genera un dashboard de
seguimiento para la Dirección. Opera como una aplicación web progresiva (PWA) instalable
en los dispositivos móviles (captores) que la organización provee a los ingenieros, para
poder trabajar sin conexión en el campo.

## Requisitos funcionales

### Módulo 1 — Autenticación y gestión de usuarios

| ID | Requisito |
|----|-----------|
| RF-01 | El sistema debe permitir el inicio de sesión mediante usuario y contraseña propios, validados contra la base de datos local del sistema. |
| RF-02 | Si las credenciales locales son válidas, el sistema debe validar el usuario contra la Autenticación Institucional (usuario + API key propia del sistema) y obtener un token JWT. |
| RF-03 | El sistema debe rechazar el inicio de sesión si el usuario no existe en la base local, aunque exista en la Autenticación Institucional. |
| RF-04 | El sistema debe cerrar la sesión automáticamente luego de 30 minutos sin interacción del usuario. Si en ese momento no hay conexión, el usuario puede reanudarla con su contraseña local según RF-57. Si en ese momento no hay conexión, el usuario puede reanudarla con su contraseña local según RF-57. |
| RF-05 | El sistema debe renovar la sesión mediante refresh token mientras haya actividad, sin requerir reingresar credenciales. |
| RF-06 | El sistema debe permitir a un usuario con rol Administrador crear, modificar y dar de baja usuarios, y asignarles un rol (Administrador, Jefe, Operador o Lector). |
| RF-07 | El sistema debe exigir que la contraseña local cumpla: mínimo 8 caracteres, al menos una mayúscula, una minúscula, un número y un carácter especial. |
| RF-08 | El sistema debe permitir que un Administrador restablezca (blanquee) la contraseña de un usuario. |
| RF-50 | Ante cualquier fallo de credenciales en el inicio de sesión (usuario inexistente, contraseña incorrecta o usuario no vigente en la Autenticación Institucional), el sistema debe mostrar un único mensaje de error genérico, sin indicar cuál de los tres motivos lo ocasionó. Si la Autenticación Institucional no responde, no se trata de un fallo de credenciales: el sistema debe mostrar un mensaje distinto que informe que el servicio no está disponible y que se intente nuevamente en un rato, sin revelar nada sobre el usuario y sin contarlo como intento fallido. |

### Módulo 2 — Lectura de solicitudes del SUA

| ID | Requisito |
|----|-----------|
| RF-09 | El sistema debe consultar al SUA las solicitudes de tipo "reclamo", subtipo "problema con el arbolado público", derivadas al área "Parques y Paseos – Dirección Técnica", aplicando ese filtro como parámetro de la consulta. |
| RF-10 | El sistema debe identificar cada solicitud de forma única mediante el Número de SUA - Año. |
| RF-11 | El sistema debe mostrar cada solicitud en uno de tres estados: Pendiente, Dictaminada o Pendiente-revisión. |
| RF-12 | El sistema debe marcar como Pendiente-revisión a una solicitud que ya tuvo un dictamen y fue re-derivada por Procesamiento de Datos con el mismo Número de SUA-Año. |
| RF-13 | El sistema debe permitir a cualquier usuario con rol Operador o Jefe visualizar el listado completo de solicitudes pendientes o pendientes-revisión, sin restricción de asignación exclusiva. |
| RF-62 | Si la geocodificación de una solicitud falla al derivarla (dirección ambigua o servicio caído), el sistema debe reintentarla automáticamente cada hora hasta lograrla; mientras no tenga coordenadas, la solicitud queda excluida del armado automático de rutas pero puede dictaminarse entrando directo desde el listado. Nadie la corrige a mano. |

### Módulo 3 — Generación de rutas de trabajo

| ID | Requisito |
|----|-----------|
| RF-14 | El sistema debe permitir a un usuario con rol Operador o Jefe generar una ruta de trabajo diaria a partir de las solicitudes pendientes. |
| RF-15 | El sistema debe permitir combinar los siguientes criterios para armar la ruta: un distrito como filtro (opcional: si no se elige ninguno, se consideran todos), cantidad por nivel de prioridad y selección manual de una zona en el mapa; la ruta se arma con la suma de las cantidades pedidas por prioridad dentro del distrito elegido. |
| RF-16 | El sistema debe excluir de una ruta nueva las solicitudes que ya forman parte de la ruta activa de otro ingeniero. |
| RF-17 | El sistema debe liberar automáticamente una solicitud reservada en una ruta cuando: se dictamina, el ingeniero presiona "Restablecer", o son las 18:00 hs del día. |
| RF-18 | El sistema debe permitir a un ingeniero descartar su ruta completa mediante el botón "Restablecer", liberando las solicitudes no dictaminadas. |
| RF-19 | El sistema debe requerir conexión a internet para generar o confirmar una ruta (no disponible en modo offline). |
| RF-47 | Cuando la cantidad de solicitudes que cumplen los criterios definidos (RF-15) supere el cupo indicado por el ingeniero, el sistema debe seleccionar cuáles incluir combinando antigüedad de la solicitud (mayor preferencia a las más antiguas) y eficiencia del recorrido resultante (menor tiempo y distancia total según el modo de desplazamiento). _(Nota técnica: criterio de desempate y métrica de eficiencia concretos en `arquitectura-tecnica.md`.)_ |
| RF-48 | El sistema debe calcular el orden de visita de las solicitudes de una ruta minimizando el tiempo y la distancia total del recorrido, tomando como punto de partida y de cierre del cálculo la sede de la Dirección General de Parques y Paseos. |
| RF-49 | El sistema debe permitir seleccionar el modo de desplazamiento (a pie o en vehículo) como criterio adicional al generar la ruta, y calcular el tiempo y la distancia en función del modo elegido. |

### Módulo 4 — Dictaminación

| ID | Requisito |
|----|-----------|
| RF-20 | El sistema debe permitir a un usuario con rol Operador o Jefe completar un dictamen técnico para una solicitud en estado Pendiente o Pendiente-revisión. |
| RF-21 | El sistema debe impedir que exista más de un dictamen activo para el mismo ejemplar: ante dos envíos simultáneos para el mismo caso, debe aceptar el primero y rechazar el segundo. |
| RF-59 | Cuando una misma solicitud queda con dos dictámenes firmados (por ejemplo, uno de ellos firmado sin conexión, ver CU-10), el sistema debe pasarla a estado Pendiente-revisión y permitir a un Jefe ver ambos en el detalle del caso y elegir cuál queda vigente; el otro queda en el historial como no vigente, y la elección registra quién la hizo, fecha y hora. |
| RF-22 | El sistema debe firmar digitalmente cada dictamen con hash, timestamp y el usuario que lo generó (identificador: inicial del nombre + 6 letras del apellido + número incremental). |
| RF-23 | El sistema debe almacenar el dictamen completo y firmado en la base de datos propia del sistema. |
| RF-24 | El sistema debe enviar al SUA, mediante la API que este expone, los datos complementarios de la solicitud, que son todo lo que cargó el ingeniero en el dictamen (campos del formulario, fotografías, autor y fecha de emisión); los datos internos del sistema (hash de firma, estado de sincronización) no se envían. |
| RF-25 | Si el envío al SUA falla, el sistema debe guardar el dictamen localmente con estado "pendiente de sincronizar" y reintentar el envío automáticamente. |
| RF-26 | El sistema debe permitir descargar el dictamen firmado en formato PDF (u otro formato imprimible) para su impresión como documento legal. |
| RF-27 | El sistema debe conservar un historial de todos los dictámenes emitidos para un mismo caso (Número de SUA-Año), sin sobrescribir los anteriores. |
| RF-28 | El sistema debe permitir a un ingeniero que dictamina un caso en estado Pendiente-revisión consultar el dictamen anterior (contenido y autor), sin precargarlo en el formulario nuevo. |
| RF-29 | El sistema debe limitar los datos del vecino visibles a lo estrictamente necesario para el trabajo técnico (ubicación y descripción del reclamo), excluyendo nombre y datos de contacto. |
| RF-45 | El sistema debe exigir al menos una fotografía del ejemplar adjunta a cada dictamen, y no debe permitir firmarlo si no hay ninguna cargada. |
| RF-46 | Si el ingeniero marca "Extracción" en el dictamen, el sistema debe deshabilitar la selección de trabajos en la parte aérea y en la parte subterránea para ese mismo dictamen, y debe rechazar el envío si de todos modos llegaran cargados. |
| RF-56 | En el formulario del dictamen, todo campo cuyo valor pertenezca a un conjunto conocido (especie, nivel de daño en vereda, motivos de extracción y de sin trabajo, trabajos aéreos y subterráneos, complejidad, plantar, nivel de prioridad, domicilio del ejemplar) debe cargarse eligiendo una opción de una lista cerrada o un punto en el mapa, sin permitir escritura libre, y el servidor debe rechazar cualquier valor que no pertenezca a esas listas. La única excepción controlada es la especie: el selector filtra el catálogo mientras el usuario escribe y, si la especie no figura, ofrece la opción "Agregar especie", que la incorpora al catálogo con su nombre normalizado (sin duplicados por mayúsculas o tildes) y registra quién la agregó. Los campos numéricos y los números de nota y expediente deben aceptar únicamente números enteros (positivos en el caso de nota y expediente); solo Referencia de ubicación y Observaciones admiten texto libre, con largo máximo. |
| RF-61 | En el formulario del dictamen, "Sin trabajo" es excluyente: al marcarlo, el sistema debe deshabilitar Extracción y los trabajos aéreos y subterráneos (y a la inversa, al marcar cualquiera de ellos debe deshabilitar "Sin trabajo"), y no debe permitir firmar un dictamen que no tenga marcada ninguna intervención (extracción, trabajo subterráneo o aéreo) ni "Sin trabajo". |
| RF-51 | Al confirmar la firma de un dictamen (paso 3 de CU-06), el sistema debe exigir un segundo factor de autenticación mediante verificación biométrica del dispositivo (WebAuthn), además de la sesión ya iniciada, dado el valor legal del acto conforme a la Ordenanza N.° 5.118/91. _(Nota técnica: detalle del flujo WebAuthn en `arquitectura-tecnica.md`.)_ |

### Módulo 5 — Trabajo sin conexión y sincronización

| ID | Requisito |
|----|-----------|
| RF-30 | El sistema debe estar disponible como PWA instalable en los captores (dispositivos Android provistos por la organización). |
| RF-31 | El sistema debe permitir completar y firmar un dictamen sin conexión a internet, siempre que la ruta correspondiente ya haya sido generada con conexión. |
| RF-32 | El sistema debe guardar localmente en el dispositivo cualquier dictamen firmado sin conexión, en estado "pendiente de sincronizar". |
| RF-33 | El sistema debe reenviar siempre, de forma automática, los dictámenes pendientes de sincronizar en cuanto detecte conexión (y también al abrir la aplicación con dictámenes en cola), sin intervención manual del usuario y sin un máximo de reintentos: un dictamen permanece en cola hasta que el servidor confirme su recepción. El reintento solo se detiene ante un rechazo explícito del servidor (por ejemplo, el hash recalculado no coincide, RF-53). |
| RF-34 | El sistema debe mostrar al ingeniero un indicador permanente del estado de sincronización (todo sincronizado / cantidad de dictámenes pendientes / sin conexión). |
| RF-52 | El sistema debe bloquear el acceso local a la aplicación en el captor luego de 5 intentos de inicio de sesión fallidos consecutivos (las caídas de la Autenticación Institucional no cuentan como intento), y debe permitir a un Administrador revocar de forma remota la sesión y los datos locales de un captor reportado como perdido o robado, en cuanto el dispositivo vuelva a tener conexión. El desbloqueo de un captor bloqueado se define en RF-60. |
| RF-57 | Si la sesión se cerró por inactividad (RF-04) y el captor no tiene conexión, el sistema debe permitir reanudarla con la contraseña local, solo si el usuario ya había iniciado sesión con conexión ese mismo día, si no transcurrieron los 7 días de tope de sesión (RNF-20) y si el captor no fue revocado (RF-52). Al recuperar la conexión, el sistema debe revalidar al usuario contra la Autenticación Institucional y cerrar la sesión si ya no está vigente. |
| RF-60 | El sistema debe permitir a un Administrador desbloquear, desde Gestión de usuarios, un captor bloqueado por RF-52. La pantalla de bloqueo del captor debe mostrar un código del dispositivo con el que el Administrador lo identifica. El desbloqueo se aplica cuando el captor tiene conexión y queda registrado en el log de auditoría (RF-54). |
| RF-53 | Al sincronizar un dictamen firmado sin conexión (CU-10), el sistema debe recalcular el hash de firma (SHA-256) sobre el contenido recibido y compararlo contra el hash generado al momento de la firma en el dispositivo; si no coinciden, debe rechazar la sincronización, conservar el dictamen marcado como "integridad no verificada" y dejarlo en el apartado "Para revisar" del Administrador (RF-58). |
| RF-58 | El sistema debe ofrecer al Administrador un apartado "Para revisar", de solo consulta, que liste los dictámenes marcados como "integridad no verificada" (RF-53) y los registros del SUA rechazados por validación (RNF-18), con tipo de caso, solicitud afectada, fecha y motivo. |

### Módulo 6 — Dashboard

| ID | Requisito |
|----|-----------|
| RF-35 | El sistema debe mostrar, para los roles Jefe, Administrador y Lector, la cantidad de solicitudes derivadas a la Dirección Técnica, dictaminadas y sin dictaminar. |
| RF-36 | El sistema debe permitir filtrar las métricas del dashboard por mes y por año. |
| RF-37 | El sistema debe contabilizar cada re-derivación de una solicitud (por vencimiento) como un evento independiente en las métricas, aunque corresponda al mismo Número de SUA-Año. |
| RF-44 | El sistema debe incluir las solicitudes de tormenta en las métricas generales del dashboard, y además debe mostrar un desglose separado exclusivo de solicitudes de tormenta. |

### Módulo 7 — Protocolo por tormenta

| ID | Requisito |
|----|-----------|
| RF-38 | El sistema debe permitir a los roles Operador, Jefe, Administrador y Lector visualizar la sección "Protocolo por tormenta", donde se listan exclusivamente las solicitudes derivadas por Procesamiento de Datos con la etiqueta "emergencia por tormenta". |
| RF-39 | Las solicitudes de tormenta no deben aparecer en el listado general de solicitudes (Módulo 2); solo son visibles dentro de "Protocolo por tormenta". |
| RF-40 | El sistema debe mostrar un indicador visual animado cuando existan solicitudes de tormenta pendientes, para señalar su máxima prioridad. |
| RF-41 | El sistema debe permitir a un usuario con rol Operador o Jefe generar una ruta de tormenta indicando únicamente la cantidad de solicitudes a incluir, priorizando siempre las solicitudes más antiguas primero. |
| RF-42 | Una ruta de tormenta debe respetar las mismas reglas de exclusión y liberación que una ruta normal (RF-16, RF-17). |
| RF-43 | El dictamen de una solicitud de tormenta debe completarse con el mismo formulario que cualquier otro dictamen (Módulo 4), sin campos adicionales. |

### Módulo 8 — Auditoría

| ID | Requisito |
|----|-----------|
| RF-54 | El sistema debe registrar, en un log de auditoría independiente e inmutable (sin edición ni borrado posterior desde la aplicación), toda alta, baja o modificación de rol de un usuario, y todo desbloqueo o revocación de un captor, indicando qué usuario la realizó, qué acción fue, y fecha y hora. |
| RF-55 | El sistema debe permitir a un usuario con rol Administrador consultar el log de auditoría, filtrando por usuario, tipo de acción y rango de fechas. |

## Requisitos no funcionales

### Rendimiento y disponibilidad

| ID | Requisito |
|----|-----------|
| RNF-01 | El sistema debe estar disponible 24/7, salvo ventanas de mantenimiento programadas fuera de la jornada operativa (lunes a sábado, 7 a 17 hs). |
| RNF-02 | El sistema debe soportar el uso simultáneo de hasta 7 ingenieros sin degradación perceptible del tiempo de respuesta. |
| RNF-03 | El sistema debe soportar un volumen de al menos 70 dictámenes diarios (hasta 10 por ingeniero, con 7 ingenieros) sin degradación del rendimiento. |
| RNF-04 | En modo offline, cada solicitud HTTP debe tener un tiempo límite de espera de 10 segundos para no bloquear la interfaz ante señal intermitente. |
| RNF-15 | El sistema debe soportar la resolución de hasta 100 solicitudes de tormenta dentro de un plazo de 48 horas hábiles, sin degradación del rendimiento. |
| RNF-17 | Ante una caída específica del SUA (distinta de la falta de conexión general del dispositivo), el sistema debe reintentar automáticamente, con espera creciente entre intentos, la lectura de solicitudes (Módulo 2) y la sincronización de dictámenes (Módulo 5), sin bloquear las funcionalidades que no dependen del SUA (consulta de dictámenes ya cargados, rutas ya generadas). |

### Seguridad y usabilidad

| ID | Requisito |
|----|-----------|
| RNF-05 | La contraseña local debe exigir un mínimo de 8 caracteres, con al menos una mayúscula, una minúscula, un número y un carácter especial, y debe almacenarse con un algoritmo de hash robusto (bcrypt), nunca en texto plano. |
| RNF-06 | El sistema no debe almacenar ni transmitir la contraseña institucional del usuario; la validación institucional se realiza solo con usuario + API key propia. |
| RNF-07 | El sistema debe usar HTTPS/TLS en todas las comunicaciones con el SUA, la Autenticación Institucional y entre cliente y servidor. |
| RNF-08 | El sistema debe limitar los datos personales del vecino que consulta y almacena a los estrictamente necesarios para el trabajo técnico. |
| RNF-09 | La interfaz debe ser utilizable en pantallas de celular (diseño responsive), dado que el ingeniero trabaja desde un captor en el campo. |
| RNF-16 | Los dictámenes y fotografías almacenados localmente en el captor en estado "pendiente de sincronizar" deben guardarse cifrados en reposo (at-rest, AES-GCM), de forma que no sean legibles si el dispositivo se pierde o es sustraído, y deben eliminarse del almacenamiento local inmediatamente después de confirmarse su sincronización con el servidor. |
| RNF-18 | El sistema debe validar y sanear (tipo, longitud y caracteres permitidos) todo dato recibido del SUA antes de persistirlo, rechazando o dejando en el apartado "Para revisar" del Administrador (RF-58) cualquier registro que no cumpla el esquema esperado. |
| RNF-19 | El sistema debe limitar server-side los intentos fallidos de inicio de sesión (máximo 10 cada 15 minutos por combinación de IP y usuario, con espera creciente entre bloqueos sucesivos), aplicándolo también a usuarios inexistentes para no revelar cuáles existen. Es una capa distinta e independiente del bloqueo local del captor a los 5 intentos consecutivos (RF-52): el captor se bloquea primero, y este límite protege contra intentos desde otros orígenes y ataques de fuerza bruta distribuidos. Una caída de la Autenticación Institucional no cuenta como intento fallido. |
| RNF-20 | La sesión de un usuario no debe mantenerse activa, mediante renovación por refresh token, por más de 7 días corridos desde el primer inicio de sesión, independientemente de cuánta actividad registre en ese lapso. |
| RNF-21 | El sistema debe incluir cabeceras de seguridad HTTP (Content-Security-Policy, HSTS, X-Frame-Options) en todas las respuestas, para mitigar ataques de tipo XSS y clickjacking sobre la interfaz web/PWA. |
| RNF-22 | Los captores deben entregarse configurados como dispositivos dedicados al sistema, con bloqueo de pantalla obligatorio por PIN o huella, y sin que sea posible apagarlos, reiniciarlos ni desactivar el Wi-Fi, los datos móviles o el modo avión sin autenticarse antes con ese PIN o huella (detalle de configuración en `arquitectura-tecnica.md`). |

### Almacenamiento y continuidad

| ID | Requisito |
|----|-----------|
| RNF-10 | Los dictámenes deben conservarse de forma indefinida en la base de datos del sistema, dado su valor de documento legal. |
| RNF-11 | El sistema debe contar con copias de backup periódicas de la base de datos de dictámenes. |

### Plataforma

| ID | Requisito |
|----|-----------|
| RNF-12 | El sistema debe funcionar como PWA instalable en dispositivos Android (captores provistos por la organización). |
| RNF-13 | El sistema no requiere soporte para iOS, dado que los dispositivos de campo son exclusivamente Android. |
| RNF-14 | El sistema debe utilizar un servicio de mapas/geolocalización de uso gratuito para la generación de rutas, que soporte el cálculo de distancia y tiempo estimado tanto a pie como en vehículo (se eligió OpenRouteService; detalle en `arquitectura-tecnica.md`). |
