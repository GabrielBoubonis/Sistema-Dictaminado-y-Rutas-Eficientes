import { useSyncExternalStore } from 'react';
import { ApiError, ErrorRed, api, hayToken, onApiEvento } from './api';
import { db, type ItemCola } from './db';
import { cifrar, descifrar } from './cifrado';

export interface EstadoSync { online: boolean; pendientes: number; rechazados: number; sincronizando: boolean }
let estado: EstadoSync = { online: typeof navigator === 'undefined' ? true : navigator.onLine, pendientes: 0, rechazados: 0, sincronizando: false };
const oyentes = new Set<() => void>();
const poner = (p: Partial<EstadoSync>) => { estado = { ...estado, ...p }; oyentes.forEach((f) => f()); };

export const useSync = () => useSyncExternalStore((f) => { oyentes.add(f); return () => { oyentes.delete(f); }; }, () => estado);

export async function refrescarContadores() {
  poner({ pendientes: await db.cola.count(), rechazados: await db.rechazados.count() });
}

export interface DictamenFirmado { dictamen: Record<string, any>; segundo_factor: unknown }

/** RF-32: guarda un dictamen firmado sin conexión, cifrado, en estado "pendiente de sincronizar". */
export async function encolar(usuario: string, item: DictamenFirmado) {
  const { iv, datos } = await cifrar(item);
  const fila: ItemCola = { uuid: item.dictamen.uuid_dictamen, usuario, numero_sua: item.dictamen.numero_sua, anio: item.dictamen.anio, creada: Date.now(), iv, datos };
  await db.cola.put(fila);
  await refrescarContadores();
}

let enCurso: Promise<void> | null = null;

/**
 * RF-33: reenvía la cola apenas hay conexión. Sin máximo de reintentos: un dictamen sale de la cola solo cuando el
 * servidor confirma (o lo rechaza de forma explícita). RNF-16: al confirmarse se borra el dato local.
 */
export function sincronizar(): Promise<void> {
  enCurso ??= (async () => {
    if (!hayToken() || !navigator.onLine) return;
    poner({ sincronizando: true });
    try {
      for (;;) {
        const lote = (await db.cola.orderBy('creada').limit(5).toArray());
        if (!lote.length) break;
        const items = await Promise.all(lote.map(async (f) => ({ fila: f, ...(await descifrar<DictamenFirmado>(f)) })));
        let r: { resultados: Array<{ uuid_dictamen: string; estado: string; mensaje?: string; error?: string }> };
        try { r = await api('/sync/dictamenes', { body: { dictamenes: items.map(({ dictamen, segundo_factor }) => ({ dictamen, segundo_factor })) } }); }
        catch (e) {
          if (e instanceof ErrorRed) break;
          if (e instanceof ApiError && e.status === 403) break; // sin permiso: no se pierde nada, queda en cola
          throw e;
        }
        let avanzo = false;
        for (const res of r.resultados) {
          const fila = lote.find((f) => f.uuid === res.uuid_dictamen);
          if (!fila) continue;
          if (res.estado === 'reintentar') continue;
          if (res.estado === 'rechazado') {
            await db.rechazados.put({ uuid: fila.uuid, usuario: fila.usuario, numero_sua: fila.numero_sua, anio: fila.anio, motivo: res.mensaje ?? res.error ?? 'Rechazado por el servidor', fecha: Date.now() });
          }
          await db.cola.delete(fila.uuid);
          avanzo = true;
        }
        await refrescarContadores();
        if (!avanzo) break;
      }
    } finally { poner({ sincronizando: false }); await refrescarContadores(); }
  })().finally(() => { enCurso = null; });
  return enCurso;
}

let iniciado = false;
export function iniciarSync() {
  if (iniciado || typeof window === 'undefined') return;
  iniciado = true;
  window.addEventListener('online', () => { poner({ online: true }); void sincronizar(); });
  window.addEventListener('offline', () => poner({ online: false }));
  onApiEvento((e) => { if (e === 'red-caida') poner({ online: false }); if (e === 'red-ok' && !estado.online) { poner({ online: true }); void sincronizar(); } });
  setInterval(() => { // si el navegador dice "online" pero no hay red real, o hay cola pendiente
    if (!navigator.onLine) return;
    if (!estado.online) void fetch('/api/health').then(() => { poner({ online: true }); void sincronizar(); }).catch(() => {});
    else if (estado.pendientes > 0) void sincronizar();
  }, 15000);
  void refrescarContadores();
}
