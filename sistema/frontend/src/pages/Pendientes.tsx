import { useEffect, useState } from 'react';
import { CircleAlert, Info } from 'lucide-react';
import { db, type Rechazado } from '../lib/db';
import { useSync } from '../lib/sync';

/**
 * Avisos de la sincronización: dictámenes que el servidor rechazó (RF-33, RF-53) y dictámenes que se guardaron como
 * no vigentes porque otro ingeniero había dictaminado el caso antes (RF-59).
 */
export function Pendientes() {
  const s = useSync();
  const [lista, setLista] = useState<Rechazado[]>([]);
  useEffect(() => { void db.rechazados.toArray().then(setLista); }, [s.rechazados, s.pendientes]);
  if (!lista.length) return null;
  const rechazados = lista.filter((r) => r.tipo !== 'no_vigente'), noVigentes = lista.filter((r) => r.tipo === 'no_vigente');
  const cerrar = async (grupo: Rechazado[]) => { await db.rechazados.bulkDelete(grupo.map((r) => r.uuid)); setLista(await db.rechazados.toArray()); };
  return (<>
    {rechazados.length > 0 && (
      <div className="error" role="alert"><CircleAlert className="ico" aria-hidden /><div>
        <strong>{rechazados.length} dictamen{rechazados.length > 1 ? 'es' : ''} no se pudo{rechazados.length > 1 ? 'ieron' : ''} sincronizar</strong>
        {rechazados.map((r) => <div key={r.uuid}>Solicitud {r.numero_sua}-{r.anio}: {r.motivo}</div>)}
        <button className="btn sec chico" style={{ marginTop: '.5rem' }} onClick={() => cerrar(rechazados)}>Entendido</button>
      </div></div>)}
    {noVigentes.length > 0 && (
      <div className="aviso" role="status"><Info className="ico" aria-hidden /><div>
        <strong>{noVigentes.length === 1 ? 'Un dictamen tuyo quedó' : `${noVigentes.length} dictámenes tuyos quedaron`} en el historial como no vigente{noVigentes.length > 1 ? 's' : ''}</strong>
        {noVigentes.map((r) => <div key={r.uuid}>Solicitud {r.numero_sua}-{r.anio}: {r.motivo}</div>)}
        <button className="btn sec chico" style={{ marginTop: '.5rem' }} onClick={() => cerrar(noVigentes)}>Entendido</button>
      </div></div>)}
  </>);
}
