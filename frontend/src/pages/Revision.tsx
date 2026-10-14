import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { fechaHora, textoError } from '../components/ui';

interface Caso { id_caso: number; tipo: string; referencia_solicitud: string; motivo: string; fecha_hora: string }

export function Revision() {
  const [casos, setCasos] = useState<Caso[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api('/revision').then(setCasos).catch((e) => setError(textoError(e))); }, []);
  return (
    <section>
      <h1>Para revisar</h1>
      <p className="ayuda">Dictámenes con integridad no verificada y registros del SUA rechazados por validación. Solo consulta.</p>
      {error && <div className="error" role="alert">{error}</div>}
      {casos && !casos.length && <p className="vacio">No hay casos para revisar.</p>}
      <div className="scroll-x">{casos && casos.length > 0 && (
        <table className="tabla"><thead><tr><th>Tipo</th><th>Solicitud</th><th>Fecha</th><th>Motivo</th></tr></thead>
          <tbody>{casos.map((c) => (
            <tr key={c.id_caso}><td><span className="badge warn">{c.tipo}</span></td>
              <td>{c.referencia_solicitud}</td>
              <td>{fechaHora(c.fecha_hora)}</td><td>{c.motivo}</td></tr>))}</tbody></table>)}</div>
    </section>
  );
}
