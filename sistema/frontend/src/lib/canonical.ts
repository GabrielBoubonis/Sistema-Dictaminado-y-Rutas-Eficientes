// Firma del dictamen: JSON canónico → SHA-256. Debe ser IDÉNTICO a backend/src/services/dictamenes.ts (contenidoFirmado)
// y backend/src/security.ts (canonicalJson). Hay un vector de prueba compartido (src/lib/canonical.test.ts).

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJson(obj[k])).join(',') + '}';
}

export async function sha256Hex(texto: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const hexABytes = (hex: string) => Uint8Array.from(hex.match(/../g)!.map((h) => parseInt(h, 16)));
export const bytesABase64Url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function contenidoFirmado(p: Record<string, any>) {
  const n = <T,>(v: T | undefined | null) => (v === undefined ? null : v);
  return {
    uuid_dictamen: p.uuid_dictamen,
    fecha_firma: new Date(p.fecha_firma).toISOString(),
    nombre_usuario: p.nombre_usuario,
    numero_sua: p.numero_sua, anio: p.anio,
    nota_numero: n(p.nota_numero), expediente_numero: n(p.expediente_numero),
    fecha_emision: p.fecha_emision, domicilio_ejemplar: n(p.domicilio_ejemplar),
    latitud_ejemplar: n(p.latitud_ejemplar), longitud_ejemplar: n(p.longitud_ejemplar),
    referencia_ubicacion: n(p.referencia_ubicacion),
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

/** Hash de firma del dictamen. `fotos` son los base64 de cada imagen (el hash de cada una se calcula acá). */
export async function calcularHashFirma(p: Record<string, any>, fotosBase64: string[]): Promise<string> {
  const fotos_sha256 = await Promise.all(fotosBase64.map(sha256Hex));
  return sha256Hex(canonicalJson(contenidoFirmado({ ...p, fotos_sha256 })));
}
