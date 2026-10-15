import { api, ErrorRed } from './api';
import { cacheGet, cacheSet } from './db';

export interface Solicitud {
  numero_sua: string; anio: number; distrito: string; prioridad: string; direccion: string; latitud: number | null; longitud: number | null;
  descripcion_reclamo: string; estado: string; es_tormenta: boolean; fecha_ultima_derivacion: string;
  sin_ubicar: boolean; reservada_por: string | null; en_conflicto?: boolean;
}
export interface ItemRuta {
  orden: number; liberada: boolean; motivo_liberacion: string | null; numero_sua: string; anio: number; direccion: string; distrito: string;
  prioridad: string; latitud: number | null; longitud: number | null; estado: string; descripcion_reclamo: string;
}
export interface Ruta {
  id_ruta: number; tipo: string; estado: string; modo_desplazamiento: string; optimizada: boolean; distancia_total_m: number | null;
  tiempo_total_s: number | null; creada: string; sede: { lat: number; lng: number }; solicitudes: ItemRuta[];
}

/** Trae del servidor y deja una copia local; sin señal devuelve la última copia (con `desdeCache = true`). */
export async function conCache<T>(clave: string, pedir: () => Promise<T>): Promise<{ datos: T | undefined; desdeCache: boolean }> {
  try {
    const datos = await pedir();
    await cacheSet(clave, datos);
    return { datos, desdeCache: false };
  } catch (e) {
    if (e instanceof ErrorRed) return { datos: await cacheGet<T>(clave), desdeCache: true };
    throw e;
  }
}

export const cargarRutaActiva = (usuario: string) => conCache<Ruta | null>(`ruta:${usuario}`, () => api('/rutas/activa'));
export const cargarSolicitudes = (query = '') => conCache<Solicitud[]>(`solicitudes${query}`, () => api(`/solicitudes${query}`));

/** Dictámenes firmados en este captor y todavía no confirmados por el servidor (para marcar la ruta sin señal). */
export async function firmadasLocales(): Promise<string[]> { return (await cacheGet<string[]>('firmadasLocales')) ?? []; }
export async function marcarFirmadaLocal(sua: string, anio: number) {
  const l = new Set(await firmadasLocales()); l.add(`${sua}-${anio}`); await cacheSet('firmadasLocales', [...l]);
}
