import { reintentarGeocodificacion, sincronizarDesdeSua } from './services/solicitudes';
import { cerrarRutasVencidas } from './services/rutas';
import { reintentarEnviosSua } from './services/registro-dictamen';

/** Tareas periódicas: sincronización con el SUA, reintento de geocodificación (RF-62) y corte de las 18:00 (RF-17). */
export function iniciarJobs() {
  const seguro = (nombre: string, fn: () => Promise<unknown>) => () => fn().catch((e) => console.error(`[job ${nombre}]`, e?.message ?? e));
  const ids = [
    setInterval(seguro('geocodificacion', reintentarGeocodificacion), 60 * 60 * 1000),
    setInterval(seguro('corte-18', () => cerrarRutasVencidas()), 60 * 1000),
    setInterval(seguro('envio-sua', () => reintentarEnviosSua()), 60 * 1000),
    setInterval(seguro('sync-sua', () => sincronizarDesdeSua()), 15 * 60 * 1000),
  ];
  ids.forEach((i) => i.unref());
  seguro('sync-sua', () => sincronizarDesdeSua())();
}
