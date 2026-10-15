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
| Fecha | Fecha, autogenerada al emitir | `fecha_emision` |
| SUA N.° | Precargado, solo lectura | (vía `Solicitud.numero_sua`) |
| Domicilio de solicitud | Precargado, solo lectura | (vía `Solicitud.direccion`) |
| Domicilio del ejemplar\* | Punto elegido en el mapa; la dirección la completa el geocodificador (puede diferir del anterior — ver Decisiones 3 y 10 en `er-modelo.md`) | `domicilio_ejemplar`, `latitud_ejemplar`, `longitud_ejemplar` |
| Referencia de ubicación | Texto libre con largo máximo | `referencia_ubicacion` |
| Especie\* | Selección con búsqueda en un catálogo; si la especie no figura, se agrega desde el selector. Obligatorio | `id_especie` |
| Distancia a medianera/referencia | Numérico, editable | `distancia_medianera_referencia` |
| Cantidad de ejemplares al frente | Numérico, editable | `cantidad_frente` |

## Paso 2 — Diagnóstico

| Campo | Tipo / origen | Atributo en er-modelo.md |
|---|---|---|
| Nivel de daño en vereda (Bloque 1) | Selección única: Alto / Medio / Bajo | `nivel_dano_vereda` |
| Extracción (Bloque 2) | Casillero booleano | `es_extraccion` |
| Perímetro del tronco (Bloque 2) | Numérico, visible solo si Extracción está marcada | `perimetro_tronco` |
| Motivo de extracción (Bloque 2) | Selección entre 12 opciones, visible solo si Extracción está marcada | `motivo_extraccion` |
| Sin trabajo (Bloque 5) | Casillero booleano | `es_sin_trabajo` |
| Motivo de sin trabajo (Bloque 5) | Selección entre 6 opciones; "Sin trabajo" es excluyente con Extracción y con los trabajos (RF-61) | `motivo_sin_trabajo` |

## Paso 3 — Intervención

_Deshabilitado por completo si en el Paso 2 se marcó Extracción (RF-46; ver nota de
"Regla de validación — exclusión extracción/trabajos" junto a la entidad `Dictamen` en
`er.puml`)._

| Campo | Tipo / origen | Entidad / atributo en er-modelo.md |
|---|---|---|
| Trabajos subterráneos (Bloque 3) | Selección múltiple, 2 opciones (una con campo de distancia) | Entidad `TrabajoSubterraneo` (`tipo_trabajo`, `distancia_borde`) |
| Trabajos aéreos (Bloque 4) | Selección múltiple, 12 opciones | Entidad `TrabajoAereo` (`tipo_trabajo`) |

## Paso 4 — Información adicional y fotografías

| Campo | Tipo / origen | Atributo en er-modelo.md |
|---|---|---|
| Complejidad de la intervención\* | Selección única: Baja / Media / Alta / Máxima | `complejidad` |
| Urgente | Casillero booleano | `urgente` |
| Árbol frente a garage | Casillero booleano | `arbol_frente_garage` |
| Media tensión | Casillero booleano | `media_tension` |
| De oficio | Casillero booleano | `de_oficio` |
| Plantar | Plantar árboles. Selección: Cazuela / Construir cazuela / Vereda jardín / Agrandar cazuela / ninguna | `plantar` |
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

_Transcriptas del formulario físico "Dictamen Técnico de Arbolado" (Secretaría de Ambiente y Espacio Público, Dirección General de Parques y Paseos). Son los valores que el servidor acepta para cada campo (RF-56)._

| Campo | Valores |
|---|---|
| Distrito | Centro, Noroeste, Norte, Oeste, Sudoeste, Sur |
| Nivel de daño en vereda | 1 – Alto, 2 – Medio, 3 – Bajo |
| Motivo de extracción (12) | 1 Árbol muerto; 2 Con riesgo de caída por ahuecamiento; 3 Con riesgo de caída por inclinación; 4 Afectado por enfermedad incurable; 5 Con pronunciado desequilibrio estructural; 6 En precario estado vegetativo; 7 No es posible implementar solución técnica; 8 Por daño intencional irreversible; 9 Obra pública; 10 Especie no apta para el lugar implantado; 11 Cepa verde; 12 Cepa muerta |
| Trabajos en la parte subterránea (2) | 1 Corte vertical de raíces (con distancia al borde del árbol, en metros); 2 Corte horizontal de raíces |
| Trabajos en la parte aérea (12) | 1 Poda de formación; 2 Liberación de conductores eléctricos; 3 Liberación de tránsito peatonal; 4 Liberación de tránsito vehicular; 5 Despeje de espacio aéreo privado; 6 Despeje de luminarias; 7 Equilibrio del ejemplar; 8 Raleo y limpieza; 9 Elevación de copa; 10 Reducción de altura de copa; 11 Reducción volumétrica; 12 Eliminación de ramas peligro |
| Motivo de sin trabajo (6) | 1 Ejemplar extraído; 2 Trabajos realizados en ramas y raíces; 3 El/los ejemplar/es no ocasionan problemas visibles; 4 El domicilio no existe; 5 Ejemplar/es en propiedad privada; 6 En el domicilio no existe arbolado público |
| Complejidad | Baja, Media, Alta, Máxima |
| Plantar (árboles) | Cazuela, Construir cazuela, Vereda jardín, Agrandar cazuela |
| Casilleros de información adicional | Urgente, Árbol frente a garage, Media tensión, De oficio |

_Nota: en el papel el casillero de cada bloque (Extracción, Trabajos subterráneos, Trabajos aéreos, Sin trabajo) se marca primero y después los motivos o ítems. "Sin trabajo" es excluyente con los otros tres (RF-61). En el papel la lista de extracción es de casilleros; el sistema la modela como una selección única (`motivo_extraccion`), a confirmar con la Dirección si un mismo ejemplar puede tener más de un motivo._

---

## Conteo total

12 (Paso 1) + 6 (Paso 2) + 2 (Paso 3, cada una admite múltiples filas) + 7 (Paso 4) + 3
(Paso 5) ≈ 25 campos de carga directa, sin contar los derivados automáticamente por el
sistema (fecha de emisión, hash de firma) ni los de solo lectura precargados desde la
Solicitud.
