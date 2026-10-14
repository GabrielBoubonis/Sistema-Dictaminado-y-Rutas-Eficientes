import { useEffect, useState } from 'react';
import { db, type Rechazado } from '../lib/db';
import { useSync } from '../lib/sync';

/** Muestra los dictámenes que el servidor rechazó de forma explícita al sincronizar (RF-33, RF-53). */
export function Pendientes() {
  const s = useSync();
  const [lista, setLista] = useState<Rechazado[]>([]);
  useEffect(() => { void db.rechazados.toArray().then(setLista); }, [s.rechazados, s.pendientes]);
  if (!lista.length) return null;
  return (
    <div className="error" role="alert">
      <strong>{lista.length} dictamen{lista.length > 1 ? 'es' : ''} no se pudo{lista.length > 1 ? 'ieron' : ''} sincronizar</strong>
      {lista.map((r) => <div key={r.uuid}>Solicitud {r.numero_sua}-{r.anio}: {r.motivo}</div>)}
      <button className="btn sec chico" style={{ marginTop: '.5rem' }} onClick={async () => { await db.rechazados.clear(); setLista([]); }}>Entendido</button>
    </div>
  );
}
