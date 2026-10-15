# Stakeholders
_Identificar y justificar las partes interesadas relevantes para el sistema._
_Para cada una: describir su rol y por qué es clave para el proyecto._

> **Nota de alcance:** este sistema resuelve únicamente la etapa de dictaminación técnica
> y planificación de rutas dentro de la Dirección Técnica de Arbolado, posterior al
> filtrado y asignación del reclamo por parte del circuito general del SUA. Por eso esta
> lista es más acotada que la relevada en el PPI (Práctica Profesionalizante I): actores
> como Munibot y las oficinas/distritos de atención presencial, que intervienen en el
> ingreso del reclamo, no tienen interacción -ni directa ni indirecta- con este sistema.
> Sí se incluyen actores externos que, sin usar el sistema, quedan conectados por el
> circuito del SUA aguas arriba (Vecino solicitante) o aguas abajo (Empresas
> concesionarias), por ser origen o consecuencia directa de lo que el sistema produce.

---

## Vecino solicitante
**Tipo:** Externo
**Subtipo:** Usuario indirecto
**Descripción:** Es la persona que reporta un problema de arbolado público en la vía
pública a través del SUA, ya sea de forma presencial, telefónica o digital. No interactúa
nunca de forma directa con el sistema de dictaminado: su reclamo llega ya cargado y
clasificado en el SUA, y el sistema lo consulta desde ahí.
**Por qué es clave:** Es el origen de todo el circuito — sin su reclamo no existe caso para
dictaminar — y el destinatario final del servicio: la calidad y el tiempo de respuesta del
dictamen impactan directamente en la resolución de su problema, aunque él nunca vea el
sistema en sí.

---

## Director administrativo
**Tipo:** Interno
**Subtipo:** Propietario del producto
**Descripción:** Supervisa la gestión general de las áreas involucradas en el circuito de
dictaminación de reclamos de arbolado. Interviene en los casos extraordinarios que no se
ajustan a los procedimientos regulares, tomando decisiones puntuales sobre cómo
resolverlos. Es el principal interesado en el dashboard de métricas del sistema.
**Por qué es clave:** Tiene la visión estratégica sobre cómo debe funcionar el proceso de
dictaminación y aprueba el proyecto; sus decisiones sobre casos excepcionales definen
reglas que terminan reflejadas en el sistema.

---

## Área de Diagramación de Datos
**Tipo:** Interno
**Subtipo:** Usuario primario
**Descripción:** Responsable del procesamiento de la información proveniente del sistema:
genera estadísticas, analiza presupuestos por intervención y realiza ajustes en la
logística del flujo de datos. En casos complejos también participa en decisiones
operativas sobre reorganización del circuito.
**Por qué es clave:** Es quien transforma los datos que produce el sistema (dictámenes,
rutas, métricas) en información de gestión para la Dirección; sin su análisis, el dashboard
y las métricas del sistema perderían buena parte de su utilidad.

---

## Área de Procesamiento de Datos
**Tipo:** Interno
**Subtipo:** Usuario indirecto (impactado)
**Descripción:** Área operativa que históricamente recibía, gestionaba y derivaba los
reclamos según zona geográfica y tipo de problema, y transcribía los dictámenes emitidos
en papel al sistema. También atendía consultas de vecinos sobre el estado de sus reclamos.
**Por qué es clave:** No usa el sistema nuevo de forma directa, pero es impactada por él:
la firma digital y la actualización automática de estado eliminan la tarea manual de
transcripción papel→digital que antes realizaba, liberando esa carga operativa.

---

## Dirección Técnica de Arbolado
**Tipo:** Interno
**Subtipo:** Usuario primario
**Descripción:** Integrada por personal técnico especializado, es la responsable de
realizar los dictámenes técnicos sobre los árboles involucrados en los reclamos: detecta
el problema, registra las características del ejemplar (especie, tamaño, estado,
ubicación) y define la intervención necesaria (poda, extracción, etc.).
**Por qué es clave:** Es el stakeholder con mayor interés estratégico en el sistema —
validó el diseño en entrevistas y mesas de trabajo — y su tarea diaria (dictaminar y
planificar rutas de recorrido) es exactamente lo que el sistema resuelve.

---

## Centro de Informática Local (CIL)
**Tipo:** Interno
**Subtipo:** Administrador técnico / Soporte técnico
**Descripción:** Área responsable de la infraestructura tecnológica, el despliegue, la
integración con otros sistemas y el soporte técnico. Gestiona los conectores del sistema y
realiza altas, bajas y modificaciones de usuarios, cumpliendo además el rol de
Administrador dentro del propio sistema.
**Por qué es clave:** Es una dependencia técnica crítica: sin su intervención el sistema
no se despliega, no se mantiene y nadie puede acceder a él, ya que es quien gestiona los
usuarios y permisos.

---

## SUA (Sistema Único de Atención)
**Tipo:** Sistema externo
**Subtipo:** — (no aplica; es un sistema, no una persona o rol)
**Descripción:** Sistema municipal donde se cargan y clasifican todos los reclamos
vecinales, incluidos los de arbolado público. Es la fuente de datos primaria del sistema
de dictaminado: desde ahí llegan los reclamos pendientes y hacia ahí se actualiza el
estado una vez firmado el dictamen.
**Por qué es clave:** Es una dependencia técnica sin la cual el sistema no tiene datos de
entrada ni forma de reportar sus resultados; toda la lógica de negocio depende de esta
integración, por eso se implementa desacoplada mediante la interfaz `IReclamoProvider`.

---

## Autenticación Institucional
**Tipo:** Sistema externo
**Subtipo:** — (no aplica; es un sistema, no una persona o rol)
**Descripción:** Sistema municipal que valida las credenciales (usuario/contraseña
institucional) del personal que accede al sistema de dictaminado.
**Por qué es clave:** Sin su validación, ningún usuario podría iniciar sesión; es una
dependencia técnica de acceso, por eso también se desacopla mediante la interfaz
`IAuthProvider`.

---

## Empresas concesionarias
**Tipo:** Externo
**Subtipo:** Usuario indirecto
**Descripción:** Entidades externas habilitadas por la municipalidad para realizar
intervenciones sobre el arbolado urbano (podas, extracciones, cortes de raíces) cuando la
Dirección Técnica no cuenta con recursos propios para ejecutarlas.
**Por qué es clave:** No interactúan con el sistema de dictaminado en ningún momento,
pero el contenido técnico del dictamen que este sistema produce (qué intervención
corresponde) es lo que después, aguas abajo y vía SUA, puede derivar trabajo hacia ellas.

---

## Equipo de desarrollo
**Tipo:** Interno
**Subtipo:** Desarrolladores y mantenedores
**Descripción:** Grupo de estudiantes responsable del diseño, desarrollo y mantenimiento
del prototipo del sistema, incluida la arquitectura desacoplada (interfaces
`IReclamoProvider` e `IAuthProvider`) y la lógica de firma digital.
**Por qué es clave:** Define las decisiones técnicas y de arquitectura que hacen posible
integrar el sistema con SUA y Autenticación Institucional en producción sin reescribir la
lógica de negocio.

---

## Tabla resumen

| Stakeholder | Tipo | Subtipo | Nivel de impacto |
|-------------|------|---------|-------------------|
| Vecino solicitante | Externo | Usuario indirecto | Medio |
| Director administrativo | Interno | Propietario del producto | Alto |
| Área de Diagramación de Datos | Interno | Usuario primario | Alto |
| Área de Procesamiento de Datos | Interno | Usuario indirecto (impactado) | Medio |
| Dirección Técnica de Arbolado | Interno | Usuario primario | Alto |
| Centro de Informática Local (CIL) | Interno | Administrador técnico / Soporte técnico | Alto |
| SUA (Sistema Único de Atención) | Sistema externo | — | Alto |
| Autenticación Institucional | Sistema externo | — | Alto |
| Empresas concesionarias | Externo | Usuario indirecto | Medio |
| Equipo de desarrollo | Interno | Desarrolladores y mantenedores | Alto |

**Criterio usado para Nivel de impacto:** Alto = usa el sistema a diario, decide sobre él,
o es una dependencia técnica sin la cual el sistema no funciona. Medio = interviene de
forma indirecta o puntual.

---

## Modelo de roles y permisos

_No confundir con los stakeholders: estos son los roles **dentro del sistema**, propios
del software y gestionados por el CIL (ver stakeholder "Centro de Informática Local")._

Se definen cuatro roles de sistema:

| Rol | Descripción | Acceso |
|---|---|---|
| **Lector** | Consulta pasiva, sin edición | Dashboard (RF-35, RF-36, RF-37, RF-44), Protocolo por tormenta — solo lectura (RF-38, RF-39, RF-40) |
| **Operador** | Rol operativo de campo | Ver solicitudes (RF-09 a RF-13), generar y restablecer rutas (RF-14 a RF-19), completar y firmar dictámenes (RF-20 a RF-29), trabajo offline y sincronización (RF-30 a RF-34), Protocolo por tormenta completo (RF-38 a RF-43) |
| **Jefe** | Supervisión operativa | Mismo acceso que Operador (RF-09 a RF-34, RF-38 a RF-43), más Dashboard (RF-35 a RF-37, RF-44) |
| **Administrador** | Personal del CIL | Gestión de usuarios y roles (RF-06, RF-07, RF-08), configuración de endpoints/credenciales de conexión con el SUA y la Autenticación Institucional (tarea de despliegue, fuera de los RF), Dashboard (RF-35 a RF-37, RF-44), Protocolo por tormenta — solo lectura (RF-38, RF-39, RF-40) |

El rol **Administrador no tiene acceso a rutas ni a dictaminación**: su función es
exclusivamente la gestión de usuarios, la configuración externa y la lectura del
dashboard (ver Alcance, sección 2.5).
