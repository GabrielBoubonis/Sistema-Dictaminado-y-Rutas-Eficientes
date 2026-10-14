import { z } from 'zod';
import { catalogos } from '../catalogos';
import { AppError } from '../errors';

const enumDe = (lista: string[]) => z.string().refine((v) => lista.includes(v), { message: 'Valor fuera de la lista permitida' });
const entero = z.number().int();
const opt = <T extends z.ZodTypeAny>(s: T) => s.nullish();

export const fotoSchema = z.object({
  /** Imagen en base64 (sin prefijo data:). Obligatoria al enviar; el servidor la guarda en disco. */
  contenido_base64: z.string().min(10),
  sha256: z.string().length(64).optional(),
});

/** Payload de un dictamen firmado (lo arma el cliente; también es lo que viaja en la cola offline). */
export const dictamenSchema = z.object({
  uuid_dictamen: z.string().min(8).max(64),
  fecha_firma: z.string().datetime({ offset: true }),
  numero_sua: z.string().min(1).max(20),
  anio: entero.min(2000).max(2100),
  nota_numero: opt(entero.positive()), // RF-56: enteros positivos
  expediente_numero: opt(entero.positive()),
  fecha_emision: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  domicilio_ejemplar: opt(z.string().max(200)),
  latitud_ejemplar: opt(z.number().min(-90).max(90)),
  longitud_ejemplar: opt(z.number().min(-180).max(180)),
  calle_esquina: opt(z.string().max(120)),
  numero_esquina: opt(z.string().max(20)),
  referencia_ubicacion: opt(z.string().max(300)), // texto libre permitido (RF-56)
  id_especie: entero.positive(),
  distancia_medianera_referencia: opt(z.number().min(0).max(100)),
  cantidad_frente: opt(entero.min(0).max(1000)),
  nivel_dano_vereda: opt(enumDe(catalogos.nivel_dano_vereda)),
  es_extraccion: z.boolean(),
  perimetro_tronco: opt(z.number().positive().max(20)),
  motivo_extraccion: opt(enumDe(catalogos.motivo_extraccion)),
  es_sin_trabajo: z.boolean(),
  motivo_sin_trabajo: opt(enumDe(catalogos.motivo_sin_trabajo)),
  trabajos_aereos: z.array(enumDe(catalogos.trabajos_aereos)).max(12),
  trabajos_subterraneos: z.array(z.object({
    tipo_trabajo: enumDe(catalogos.trabajos_subterraneos),
    distancia_borde: opt(z.number().positive().max(20)),
  })).max(3),
  complejidad: enumDe(catalogos.complejidad),
  urgente: z.boolean().default(false),
  arbol_frente_garage: z.boolean().default(false),
  media_tension: z.boolean().default(false),
  de_oficio: z.boolean().default(false),
  plantar: opt(enumDe(catalogos.plantar)),
  nivel_prioridad: enumDe(catalogos.nivel_prioridad),
  observaciones: opt(z.string().max(1000)), // texto libre permitido (RF-56)
  fotos: z.array(fotoSchema).min(1, 'Se requiere al menos una fotografía (RF-45)').max(10),
  /** Hash calculado en el dispositivo al firmar. Obligatorio en la sincronización offline (RF-53). */
  hash_firma: z.string().length(64).optional(),
  firmado_sin_conexion: z.boolean().default(false),
});
export type DictamenPayload = z.infer<typeof dictamenSchema>;

/** Contenido que se firma (JSON canónico → SHA-256). Debe ser idéntico en cliente y servidor. */
export function contenidoFirmado(p: {
  uuid_dictamen: string; fecha_firma: string; nombre_usuario: string; [k: string]: any;
}) {
  const n = <T>(v: T | undefined | null) => (v === undefined ? null : v);
  return {
    uuid_dictamen: p.uuid_dictamen,
    fecha_firma: new Date(p.fecha_firma).toISOString(),
    nombre_usuario: p.nombre_usuario,
    numero_sua: p.numero_sua, anio: p.anio,
    nota_numero: n(p.nota_numero), expediente_numero: n(p.expediente_numero),
    fecha_emision: p.fecha_emision, domicilio_ejemplar: n(p.domicilio_ejemplar),
    latitud_ejemplar: n(p.latitud_ejemplar), longitud_ejemplar: n(p.longitud_ejemplar),
    calle_esquina: n(p.calle_esquina), numero_esquina: n(p.numero_esquina), referencia_ubicacion: n(p.referencia_ubicacion),
    id_especie: p.id_especie, distancia_medianera_referencia: n(p.distancia_medianera_referencia), cantidad_frente: n(p.cantidad_frente),
    nivel_dano_vereda: n(p.nivel_dano_vereda),
    es_extraccion: !!p.es_extraccion, perimetro_tronco: n(p.perimetro_tronco), motivo_extraccion: n(p.motivo_extraccion),
    es_sin_trabajo: !!p.es_sin_trabajo, motivo_sin_trabajo: n(p.motivo_sin_trabajo),
    complejidad: p.complejidad, urgente: !!p.urgente, arbol_frente_garage: !!p.arbol_frente_garage,
    media_tension: !!p.media_tension, de_oficio: !!p.de_oficio, plantar: n(p.plantar),
    nivel_prioridad: p.nivel_prioridad, observaciones: n(p.observaciones),
    trabajos_aereos: [...(p.trabajos_aereos ?? [])].sort(),
    trabajos_subterraneos: [...(p.trabajos_subterraneos ?? [])]
      .map((t: any) => ({ tipo_trabajo: t.tipo_trabajo, distancia_borde: n(t.distancia_borde) }))
      .sort((a, b) => a.tipo_trabajo.localeCompare(b.tipo_trabajo)),
    fotos_sha256: [...(p.fotos_sha256 ?? [])].sort(),
  };
}

/** Reglas de negocio del formulario (RF-45, RF-46, RF-61, RF-56). Lanza AppError 422. */
export function validarReglas(p: DictamenPayload) {
  const errores: { campo: string; mensaje: string }[] = [];
  const hayTrabajos = p.trabajos_aereos.length > 0 || p.trabajos_subterraneos.length > 0;
  if (p.es_extraccion) {
    if (!p.motivo_extraccion) errores.push({ campo: 'motivo_extraccion', mensaje: 'Indicá el motivo de la extracción' });
    if (hayTrabajos) errores.push({ campo: 'trabajos', mensaje: 'Con Extracción no se pueden cargar trabajos aéreos ni subterráneos (RF-46)' });
    if (p.es_sin_trabajo) errores.push({ campo: 'es_sin_trabajo', mensaje: '"Sin trabajo" es excluyente con Extracción (RF-61)' });
  } else if (p.motivo_extraccion || p.perimetro_tronco) {
    errores.push({ campo: 'motivo_extraccion', mensaje: 'El motivo y el perímetro solo aplican si se marca Extracción' });
  }
  if (p.es_sin_trabajo) {
    if (!p.motivo_sin_trabajo) errores.push({ campo: 'motivo_sin_trabajo', mensaje: 'Indicá el motivo de "Sin trabajo"' });
    if (hayTrabajos) errores.push({ campo: 'trabajos', mensaje: '"Sin trabajo" es excluyente con los trabajos aéreos y subterráneos (RF-61)' });
  } else if (p.motivo_sin_trabajo) {
    errores.push({ campo: 'motivo_sin_trabajo', mensaje: 'El motivo solo aplica si se marca "Sin trabajo"' });
  }
  if (!p.es_extraccion && !p.es_sin_trabajo && !hayTrabajos) {
    errores.push({ campo: 'intervencion', mensaje: 'El dictamen debe marcar alguna intervención o "Sin trabajo" (RF-61)' });
  }
  for (const t of p.trabajos_subterraneos) {
    if (t.tipo_trabajo === 'Corte vertical de raíces' && !t.distancia_borde) {
      errores.push({ campo: 'trabajos_subterraneos', mensaje: 'El corte vertical de raíces requiere la distancia al borde del árbol' });
    }
  }
  if (new Set(p.trabajos_aereos).size !== p.trabajos_aereos.length) errores.push({ campo: 'trabajos_aereos', mensaje: 'Hay trabajos repetidos' });
  if (errores.length) throw new AppError(422, 'dictamen_invalido', 'El dictamen no cumple las reglas del formulario', { detalles: errores });
}
