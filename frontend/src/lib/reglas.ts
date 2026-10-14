import catalogos from '../catalogos.json';

export interface FormDictamen {
  nota_numero: string; expediente_numero: string; fecha_emision: string;
  latitud_ejemplar: number | null; longitud_ejemplar: number | null; calle_esquina: string; numero_esquina: string; referencia_ubicacion: string;
  id_especie: number | null; distancia_medianera_referencia: string; cantidad_frente: string; nivel_dano_vereda: string;
  es_extraccion: boolean; perimetro_tronco: string; motivo_extraccion: string; es_sin_trabajo: boolean; motivo_sin_trabajo: string;
  trabajos_aereos: string[]; trabajos_subterraneos: { tipo_trabajo: string; distancia_borde: string }[];
  complejidad: string; urgente: boolean; arbol_frente_garage: boolean; media_tension: boolean; de_oficio: boolean; plantar: string;
  nivel_prioridad: string; observaciones: string; fotos: string[]; uuid_dictamen: string;
}

export const CORTE_VERTICAL = 'Corte vertical de raíces';
export const vacioFormulario = (hoy: string): FormDictamen => ({
  nota_numero: '', expediente_numero: '', fecha_emision: hoy, latitud_ejemplar: null, longitud_ejemplar: null, calle_esquina: '', numero_esquina: '',
  referencia_ubicacion: '', id_especie: null, distancia_medianera_referencia: '', cantidad_frente: '', nivel_dano_vereda: '',
  es_extraccion: false, perimetro_tronco: '', motivo_extraccion: '', es_sin_trabajo: false, motivo_sin_trabajo: '', trabajos_aereos: [],
  trabajos_subterraneos: [], complejidad: '', urgente: false, arbol_frente_garage: false, media_tension: false, de_oficio: false, plantar: '',
  nivel_prioridad: '', observaciones: '', fotos: [], uuid_dictamen: '',
});

const entPos = (s: string) => /^[1-9]\d*$/.test(s.trim());
const num = (s: string) => s.trim() !== '' && Number.isFinite(Number(s.replace(',', '.')));
export const aNumero = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')));

/** Validación por paso. Refleja las reglas del servidor (RF-45, RF-46, RF-56, RF-61). Devuelve los mensajes de error. */
export function validarPaso(paso: number, f: FormDictamen): string[] {
  const e: string[] = [];
  const hayTrabajos = f.trabajos_aereos.length > 0 || f.trabajos_subterraneos.length > 0;
  if (paso === 1) {
    if (f.latitud_ejemplar === null) e.push('Marcá en el mapa dónde está el ejemplar.');
    if (!f.id_especie) e.push('Elegí la especie.');
    if (f.nota_numero && !entPos(f.nota_numero)) e.push('La nota debe ser un número entero positivo.');
    if (f.expediente_numero && !entPos(f.expediente_numero)) e.push('El expediente debe ser un número entero positivo.');
    if (f.cantidad_frente && !/^\d+$/.test(f.cantidad_frente)) e.push('La cantidad al frente debe ser un número entero.');
    if (f.distancia_medianera_referencia && (!num(f.distancia_medianera_referencia) || Number(f.distancia_medianera_referencia.replace(',', '.')) < 0)) e.push('La distancia a la medianera debe ser un número.');
    if (f.referencia_ubicacion.length > 300) e.push('La referencia de ubicación es demasiado larga (máximo 300).');
  }
  if (paso === 2) {
    if (f.es_extraccion && !f.motivo_extraccion) e.push('Indicá el motivo de la extracción.');
    if (f.es_extraccion && f.perimetro_tronco && !num(f.perimetro_tronco)) e.push('El perímetro del tronco debe ser un número.');
    if (f.es_sin_trabajo && !f.motivo_sin_trabajo) e.push('Indicá el motivo de “Sin trabajo”.');
  }
  if (paso === 3) {
    for (const t of f.trabajos_subterraneos) if (t.tipo_trabajo === CORTE_VERTICAL && !num(t.distancia_borde)) e.push('El corte vertical de raíces requiere la distancia al borde del árbol.');
    if (!f.es_extraccion && !f.es_sin_trabajo && !hayTrabajos) e.push('Marcá al menos una intervención (en este paso) o “Sin trabajo” / “Extracción” en el paso 2.');
  }
  if (paso === 4) {
    if (!f.complejidad) e.push('Elegí la complejidad de la intervención.');
    if (f.fotos.length < 1) e.push('Agregá al menos una fotografía del ejemplar.');
  }
  if (paso === 5) {
    if (!f.nivel_prioridad) e.push('Elegí el nivel de prioridad de la intervención.');
    if (f.observaciones.length > 1000) e.push('Las observaciones son demasiado largas (máximo 1000).');
  }
  return e;
}

export const catalogosForm = catalogos;
