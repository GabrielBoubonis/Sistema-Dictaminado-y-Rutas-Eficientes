# Dictamen Técnico de Arbolado — detalle de campos

_Este archivo es un respaldo de referencia: enumera los ~25 campos del formulario físico
"Dictamen Técnico de Arbolado" que el formulario digital reproduce (ver `diseño-ui.md`,
Pantalla/Módulo 4, y el wireframe `diagramas/wireframes/04-formulario-dictamen.svg`), con el
paso del formulario digital en el que aparece cada uno y, cuando corresponde, el atributo
equivalente en `er-modelo.md` (entidad `Dictamen`)._

---

## Paso 1 — Datos del ejemplar y ubicación

| Campo | Tipo / origen | Atributo en er-modelo.md |
|---|---|---|
| Distrito | Precargado desde la Solicitud, solo lectura | (vía `Solicitud.distrito`, no se duplica en `Dictamen`) |
| Nota N.° | Número entero positivo | `nota_numero` |
| Exp N.° | Número entero positivo | `expediente_numero` |
| Fecha | Solo lectura: la del día de la firma (hora de Argentina). No se puede elegir otra; el servidor rechaza una fecha distinta o una firma futura | `fecha_emision` |
| SUA N.° | Precargado, solo lectura | (vía `Solicitud.numero_sua`) |
| Domicilio de solicitud | Precargado, solo lectura | (vía `Solicitud.direccion`) |
| Domicilio del ejemplar\* | La dirección se copia del reclamo (es la del árbol); la ubicación exacta se marca en el mapa — ver Decisiones 3 y 10 en `er-modelo.md` | `domicilio_ejemplar`, `latitud_ejemplar`, `longitud_ejemplar` |
| Referencia de ubicación | Texto libre con largo máximo | `referencia_ubicacion` |
| Especie\* | Selección con búsqueda en un catálogo; si la especie no figura, se agrega desde el selector. Obligatorio | `id_especie` |
| Distancia a medianera/referencia | Numérico en metros, de 0 a 100 | `distancia_medianera_referencia` |
| Cantidad de ejemplares al frente | Numérico, editable | `cantidad_frente` |

## Paso 2 — Diagnóstico

| Campo | Tipo / origen | Atributo en er-modelo.md |
|---|---|---|
| Nivel de daño en vereda (Bloque 1) | Selección única: Alto / Medio / Bajo | `nivel_dano_vereda` |
| Extracción (Bloque 2) | Casillero booleano | `es_extraccion` |
| Perímetro del tronco (Bloque 2) | Numérico en metros (hasta 20), visible solo si Extracción está marcada | `perimetro_tronco` |
| Motivo de extracción (Bloque 2) | Selección entre 12 opciones, visible solo si Extracción está marcada | `motivo_extraccion` |
| Sin trabajo (Bloque 5) | Casillero booleano | `es_sin_trabajo` |
| Motivo de sin trabajo (Bloque 5) | Selección entre 6 opciones; "Sin trabajo" es excluyente con Extracción y con los trabajos (RF-61) | `motivo_sin_trabajo` |

## Paso 3 — Intervención

_Deshabilitado por completo si en el Paso 2 se marcó Extracción (RF-46; ver nota de
"Regla de validación — exclusión extracción/trabajos" junto a la entidad `Dictamen` en
`er.puml`)._

| Campo | Tipo / origen | Entidad / atributo en er-modelo.md |
|---|---|---|
| Trabajos subterráneos (Bloque 3) | Selección múltiple, 3 opciones: corte vertical (con distancia al borde, en metros, obligatoria), corte horizontal (con profundidad en cm, opcional) y agrandamiento de cazuela | Entidad `TrabajoSubterraneo` (`tipo_trabajo`, `distancia_borde`, `profundidad_cm`) |
| Trabajos aéreos (Bloque 4) | Selección múltiple, 12 opciones | Entidad `TrabajoAereo` (`tipo_trabajo`) |

## Paso 4 — Información adicional y fotografías

| Campo | Tipo / origen | Atributo en er-modelo.md |
|---|---|---|
| Complejidad de la intervención\* | Selección única: Baja / Media / Alta / Máxima | `complejidad` |
| Urgente | Casillero booleano | `urgente` |
| Árbol frente a garage | Casillero booleano | `arbol_frente_garage` |
| Media tensión | Casillero booleano | `media_tension` |
| De oficio | Casillero booleano | `de_oficio` |
| Descopado | Casillero booleano | `descopado` |
| Plantar | Plantar árboles. Selección: Vereda jardín / Cazuela libre / Construir cazuela / ninguna | `plantar` |
| Fotografías del ejemplar\* | Mínimo 1, obligatorio (RF-45) | Entidad `Fotografia` (`archivo_referencia`, `orden`) |

## Paso 5 — Observaciones y firma

| Campo | Tipo / origen | Atributo en er-modelo.md |
|---|---|---|
| Nivel de prioridad de la intervención\* | Selección única: Alta / Media / Baja (urgencia de ejecución, no confundir con la prioridad de triage de la Solicitud — ver Decisión 6 en `er-modelo.md`) | `nivel_prioridad` |
| Observaciones | Texto libre con largo máximo | `observaciones` |
| Firma digital | Generada por el sistema al confirmar (hash + timestamp + usuario, con verificación WebAuthn previa — RF-51) | `hash_firma` |

\* Campo obligatorio.

**Regla general (RF-56):** solo Referencia de ubicación y Observaciones admiten texto libre. Todo
campo con valores conocidos se elige de una lista cerrada o en el mapa, y el servidor rechaza
cualquier valor fuera de ellas (ver Decisión 10 en `er-modelo.md`).

## Listas cerradas tomadas del formulario en papel

_Transcriptas del formulario físico "Dictamen Técnico de Arbolado" (Secretaría de Ambiente y Espacio Público, Dirección General de Parques y Paseos) y ajustadas (13/11/2026) a la redacción y los códigos del reporte real de solicitudes de la Dirección. Son los valores que el servidor acepta para cada campo (RF-56)._

| Campo | Valores |
|---|---|
| Distrito | Centro, Noroeste, Norte, Oeste, Sudoeste, Sur |
| Nivel de daño en vereda | 1 – Alto, 2 – Medio, 3 – Bajo |
| Motivo de extracción (12) | 2.1 Árbol muerto; 2.2 Con riesgo de caída por ahuecamiento; 2.3 Con riesgo de caída por inclinación; 2.4 Afectado por una enfermedad incurable; 2.5 Con pronunciado desequilibrio estructural; 2.6 En precario estado vegetativo; 2.7 No es posible implementar una solución técnica; 2.8 Por daño intencional irreversible; 2.9 Obra pública; 2.10 Especie no apta para el lugar implantado; 2.11 Cepa verde; 2.12 Cepa muerta |
| Trabajos en la parte subterránea (3) | Corte vertical de raíces (con distancia al borde del árbol, en metros); Corte horizontal de raíces (con profundidad en cm, opcional); Agrandamiento de cazuela |
| Trabajos en la parte aérea (12) | 4.1 Poda de formación; 4.2 Liberación de conductores aéreos; 4.3 Liberación de tránsito peatonal; 4.4 Liberación de tránsito vehicular; 4.5 Despeje de espacio aéreo privado; 4.6 Despeje de luminarias; 4.7 Equilibrio del ejemplar; 4.8 Raleo y limpieza; 4.9 Elevación de copas; 4.10 Reducción de altura de copa; 4.11 Reducción volumétrica de copa; 4.12 Eliminación de ramas peligrosas |
| Motivo de sin trabajo (6) | 1 Ejemplar extraído; 2 Trabajos realizados en ramas y raíces; 3 El/los ejemplar/es no ocasionan problemas visibles; 4 El domicilio no existe; 5 Ejemplar/es en propiedad privada; 6 En el domicilio no existe arbolado público |
| Complejidad | Baja, Media, Alta, Máxima |
| Plantar (árboles) | Vereda jardín, Cazuela libre, Construir cazuela |
| Casilleros de información adicional | Urgente, Árbol frente a garage, Media tensión, De oficio, Descopado |
| Especie | Catálogo de 76 nombres comunes del reporte real (Fresno, Plátano, Ficus, Ligustro, Jacarandá…, más "Sin determinar"); se puede agregar una desde el selector |

_Nota: en el papel el casillero de cada bloque (Extracción, Trabajos subterráneos, Trabajos aéreos, Sin trabajo) se marca primero y después los motivos o ítems. "Sin trabajo" es excluyente con los otros tres (RF-61). En el papel la lista de extracción es de casilleros; el sistema la modela como una selección única (`motivo_extraccion`), a confirmar con la Dirección si un mismo ejemplar puede tener más de un motivo. Según el reporte real, "Agrandamiento de cazuela" es un trabajo subterráneo y no una opción de Plantar (decisión del usuario, 13/11/2026)._

---

## Conteo total

12 (Paso 1) + 6 (Paso 2) + 2 (Paso 3, cada una admite múltiples filas) + 8 (Paso 4) + 3
(Paso 5) ≈ 26 campos de carga directa, sin contar los derivados automáticamente por el
sistema (fecha de emisión, hash de firma) ni los de solo lectura precargados desde la
Solicitud.
