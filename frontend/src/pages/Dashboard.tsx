import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { textoError } from '../components/ui';

interface Met { derivadas: number; dictaminadas: number; sin_dictaminar: number }
interface Datos { periodo: { anio: number; mes: number | null }; general: Met; tormenta: Met; por_distrito: Record<string, Met> }
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function Tarjetas({ m, titulo }: { m: Met; titulo: string }) {
  return (
    <div className="card"><h2 style={{ marginTop: 0 }}>{titulo}</h2>
      <div className="grid2">
        <div><div className="num">{m.derivadas}</div>Derivadas a la Dirección Técnica</div>
        <div><div className="num">{m.dictaminadas}</div>Dictaminadas</div>
        <div><div className="num">{m.sin_dictaminar}</div>Sin dictaminar</div>
      </div>
    </div>
  );
}

export function Dashboard() {
  const ahora = new Date();
  const [anio, setAnio] = useState(ahora.getFullYear());
  const [mes, setMes] = useState('');
  const [d, setD] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setError(null);
    api(`/dashboard?anio=${anio}${mes ? `&mes=${mes}` : ''}`).then(setD).catch((e) => setError(textoError(e)));
  }, [anio, mes]);
  return (
    <section>
      <h1>Dashboard</h1>
      <div className="grid2">
        <div><label htmlFor="mes">Mes</label><select id="mes" value={mes} onChange={(e) => setMes(e.target.value)}><option value="">Todo el año</option>{MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></div>
        <div><label htmlFor="anio">Año</label><input id="anio" type="number" min={2000} max={2100} value={anio} onChange={(e) => setAnio(Number(e.target.value) || ahora.getFullYear())} /></div>
      </div>
      {error && <div className="error" role="alert">{error}</div>}
      {d && (<>
        <Tarjetas m={d.general} titulo="General (incluye tormenta)" />
        <Tarjetas m={d.tormenta} titulo="⛈ Solo tormenta" />
        <p className="ayuda">Cada re-derivación por vencimiento cuenta como un evento independiente, aunque sea el mismo Número de SUA-Año.</p>
        <h2>Por distrito</h2>
        <div className="scroll-x"><table className="tabla"><thead><tr><th>Distrito</th><th>Derivadas</th><th>Dictaminadas</th><th>Sin dictaminar</th></tr></thead>
          <tbody>{Object.entries(d.por_distrito).sort().map(([k, m]) => <tr key={k}><td>{k}</td><td>{m.derivadas}</td><td>{m.dictaminadas}</td><td>{m.sin_dictaminar}</td></tr>)}</tbody></table></div>
      </>)}
    </section>
  );
}
