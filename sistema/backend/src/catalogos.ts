import data from './catalogos.json';

// Listas cerradas del formulario en papel (RF-56). Fuente única: catalogos.json.
export const catalogos = data as {
  distritos: string[];
  nivel_dano_vereda: string[];
  motivo_extraccion: string[];
  trabajos_subterraneos: string[];
  trabajos_aereos: string[];
  motivo_sin_trabajo: string[];
  complejidad: string[];
  plantar: string[];
  nivel_prioridad: string[];
};

export const ROLES = ['Lector', 'Operador', 'Jefe', 'Administrador'] as const;
export type Rol = (typeof ROLES)[number];
export const PRIORIDADES = ['Alta', 'Media', 'Baja'] as const;
export const MODOS = ['Caminando', 'Vehículo'] as const;
export const ESTADOS_SOLICITUD = ['Pendiente', 'Dictaminada', 'Pendiente-revisión'] as const;

/** Normaliza el nombre de una especie: sin tildes, minúsculas, espacios simples (RF-56: sin duplicados). */
export function normalizarNombre(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function tituloEspecie(s: string): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}
