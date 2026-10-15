# Datos de prueba para la demo

Datos **ficticios** para cargar las dos bases simuladas (SUA y Autenticación Institucional) y la base propia del sistema. Ningún nombre corresponde a una persona real. Las direcciones son reales de Rosario: cada una se verificó con Georef (INDEC) y Nominatim (OpenStreetMap) con altura exacta, salvo "Pasaje sin nombre s/n", que queda sin ubicar a propósito (RF-62). El distrito de cada solicitud es el que corresponde a su ubicación según los límites de los seis distritos municipales cargados en OpenStreetMap (verificado el 15/10/2026).

## Archivos

| Archivo | Qué contiene | Se carga en |
|---|---|---|
| `solicitudes-sua.json` / `.csv` | 42 solicitudes con el esquema del mock SUA (`arquitectura-tecnica.md` §3). El CSV agrega la columna `estado_esperado_en_sistema`. | Mock SUA (`solicitudes_sua`) |
| `usuarios-institucionales.json` | 8 usuarios del mock de Autenticación Institucional (uno no vigente). | Mock Autenticación |
| `usuarios-sistema.json` | 7 usuarios con rol, para la tabla `Usuario`. | Base propia |
| `especies.json` | Catálogo inicial de 23 especies. | Tabla `Especie` |
| `historial-derivaciones.json` | Un evento por solicitud, más la derivación original de las 2 re-derivadas. | Tabla `HistorialDerivacion` |
| `dictamenes-ejemplo.json` | 8 dictámenes ya firmados y sincronizados (6 solicitudes dictaminadas + el dictamen anterior de las 2 re-derivadas). | Tabla `Dictamen` y tablas hijas |
| `catalogos.json` | Todas las listas cerradas del formulario en papel (distritos, motivos de extracción, trabajos, motivos de "sin trabajo", etc.). | Constantes o tablas de catálogo |
| `dictamenes-conflicto.json` | Dos dictámenes firmados para la solicitud 48495-2026 (uno de extracción y otro de poda firmado sin conexión). | Para probar RF-59 y CU-15 |
| `dispositivos.json` | 3 captores: uno bloqueado (K7M2-X9QD), uno revocado y uno activo. | Tabla `Dispositivo` (RF-60, CU-16) |
| `casos-revision.json` | 2 casos para el apartado "Para revisar" (integridad no verificada y datos inválidos del SUA). | Tabla `CasoRevision` (RF-58, CU-14) |
| `fotos/` | 3 imágenes de relleno para las fotografías de los dictámenes. | Almacenamiento de fotos |

## Qué casos cubre

| Caso | Cantidad | Para probar |
|---|---|---|
| Solicitudes normales pendientes | 25 | Listado, filtros, generación de ruta (RF-14 a RF-19, RF-47 a RF-49). Mezcla de distritos (Centro, Norte, Noroeste, Oeste, Sudoeste, Sur) y prioridades (Alta, Media, Baja). |
| Solicitud con dirección no ubicable | 1 | Falla de geocodificación (Decisión 9): queda disponible para consulta, pero fuera del cálculo de rutas. Es la de dirección "Pasaje sin nombre s/n". |
| Solicitudes de tormenta | 8 | Sección "Protocolo por tormenta" (RF-38 a RF-43). Fechas repetidas a propósito (2 por día) para probar el orden por antigüedad y pedir, por ejemplo, 5 de las 8. No deben aparecer en el listado general. |
| Solicitudes ya dictaminadas | 6 | Dashboard, historial y descarga de PDF. Con estado `Dictaminada`. |
| Solicitud con dos dictámenes | 1 | La 48495 (cuenta entre las 25 pendientes del CSV, pero al cargar `dictamenes-conflicto.json` pasa a `Pendiente-revisión`): un Jefe elige cuál queda vigente (RF-59, CU-15). |
| Solicitudes re-derivadas | 2 | `es_rederivacion = true` y año de origen 2025: deben quedar en `Pendiente-revisión` (RF-12, HU-14). Tienen un dictamen anterior. |

Las fechas de derivación van del 17/08 al 06/10/2026, para que el dashboard tenga datos en agosto, septiembre y octubre. Hay días con más de una solicitud para probar los tramos de antigüedad de la ruta.

## Usuarios

Todos usan la misma contraseña de demostración: `Demo2026!` (solo para la demo; guardarla siempre hasheada con bcrypt, costo 12).

| Usuario | Rol | Para probar |
|---|---|---|
| `mrossi0`, `cbenite0`, `lfernan0` | Operador | Rutas y dictámenes. Usar dos Operadores a la vez para probar que una solicitud reservada no aparece en la ruta del otro. |
| `pgimene0` | Jefe | Dashboard y permisos de Jefe. |
| `asuarez0` | Administrador | Alta, baja y cambio de rol, auditoría, revocación de captor. |
| `tmolina0` | Lector | Solo consulta. |
| `jdiaz0` | Operador, pero **no vigente** en la Autenticación Institucional | Debe fallar con el mensaje genérico (RF-50). |
| `nmedina0` | Existe en la Autenticación Institucional, **sin cuenta** en el sistema | Debe fallar con el mismo mensaje genérico. |

## Cómo cargarlos (para quien desarrolla)

1. Cargar los JSON en el orden: usuarios institucionales, usuarios del sistema (hasheando `password_demo` con bcrypt y **sin guardar** el campo en texto plano), especies, solicitudes, historial, dictámenes.
2. Los estados de las solicitudes no vienen en el mock del SUA: se calculan al leerlas. Los valores esperados están en la columna `estado_esperado_en_sistema` del CSV.
3. Geocodificar la dirección de cada solicitud **una sola vez** y guardar `latitud` y `longitud` (Decisión 9), para no gastar la cuota gratuita de OpenRouteService en cada ruta.
4. En `dictamenes-ejemplo.json`: reemplazar `hash_firma` (`<CALCULAR_EN_SEED>`) con el SHA-256 real del contenido, y completar `latitud_ejemplar` y `longitud_ejemplar` con las de la solicitud. El campo `nota_prueba` no es parte del modelo, se puede ignorar.
5. Cargar también `dispositivos.json` y `casos-revision.json`. La solicitud 48495 queda en Pendiente-revisión por tener dos dictámenes: cargar `dictamenes-conflicto.json` después de los dictámenes de ejemplo.
6. Las rutas, los registros de auditoría y los dictámenes pendientes de sincronizar no se precargan: se generan usando el sistema durante la demo.

## Catálogos del formulario

Los catálogos de motivos de extracción (12), trabajos aéreos (12), trabajos subterráneos (3) y motivos de "sin trabajo" (6) se transcribieron del formulario en papel y están en `catalogos.json`. Los dictámenes de `dictamenes-ejemplo.json` no usan extracción ni "sin trabajo" a propósito; `dictamenes-conflicto.json` incluye un caso con extracción. Todos los dictámenes de ejemplo tienen `vigente = true`, salvo los dos del conflicto, que quedan en `null` hasta que un Jefe elige.

Para probar la regla RF-61: marcar "Sin trabajo" debe deshabilitar Extracción y los trabajos, y firmar sin ninguna intervención ni "Sin trabajo" debe fallar.
