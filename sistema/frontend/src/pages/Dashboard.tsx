import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { textoError } from '../components/ui';

interface Met { derivadas: number; dictaminadas: number; sin_dictaminar: number }
interface Datos { periodo: { anio: number; mes: number | null }; general: Met; tormenta: Met; por_distrito: Record<string, Met>; por_prioridad: Record<string, Met>; por_mes: Met[] }
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];


// Colores validados (categóricos 1 y 2, contraste ≥ 3:1 y separación para daltonismo). Nunca solo color: hay leyenda y valores.
const C_DICT = '#2a78d6', C_SIN = '#eb6834';
const MESES_C = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const pct = (a: number, t: number) => (t ? Math.round((a / t) * 100) : 0);

function Leyenda() {
  return (
    <div className="leyenda" aria-hidden="true">
      <span><i style={{ background: C_DICT }} />Dictaminadas</span>
      <span><i style={{ background: C_SIN }} />Sin dictaminar</span>
    </div>
  );
}

function Dona({ m, titulo }: { m: Met; titulo: string }) {
  const r = 52, c = 2 * Math.PI * r, f = m.derivadas ? m.dictaminadas / m.derivadas : 0;
  return (
    <figure className="graf" aria-label={`${titulo}: ${m.dictaminadas} de ${m.derivadas} dictaminadas`}>
      <figcaption>{titulo}</figcaption>
      <svg viewBox="0 0 140 140" role="img" aria-label={`${pct(m.dictaminadas, m.derivadas)} % dictaminadas`}>
        <circle cx="70" cy="70" r={r} fill="none" stroke={m.derivadas ? C_SIN : '#e3e6e3'} strokeWidth="16"><title>{`Sin dictaminar: ${m.sin_dictaminar}`}</title></circle>
        {m.derivadas > 0 && <circle cx="70" cy="70" r={r} fill="none" stroke={C_DICT} strokeWidth="16" strokeLinecap="butt"
          strokeDasharray={`${Math.max(f * c - 2, 0)} ${c}`} transform="rotate(-90 70 70)"><title>{`Dictaminadas: ${m.dictaminadas}`}</title></circle>}
        <text x="70" y="68" textAnchor="middle" fontSize="26" fontWeight="700" fill="currentColor">{pct(m.dictaminadas, m.derivadas)}%</text>
        <text x="70" y="88" textAnchor="middle" fontSize="11" fill="#52514e">{m.dictaminadas} de {m.derivadas}</text>
      </svg>
    </figure>
  );
}

/** Barras horizontales apiladas (dictaminadas + sin dictaminar) con el total al final. */
function BarrasApiladas({ datos, titulo }: { datos: [string, Met][]; titulo: string }) {
  const max = Math.max(1, ...datos.map(([, m]) => m.derivadas));
  const W = 400, L = 84, R = 36, H = 26, G = 10;
  return (
    <figure className="graf">
      <figcaption>{titulo}</figcaption>
      <Leyenda />
      <svg viewBox={`0 0 ${W} ${datos.length * (H + G)}`} role="img" aria-label={titulo} style={{ width: '100%' }}>
        {datos.map(([k, m], i) => {
          const y = i * (H + G), esc = (W - L - R) / max, wd = m.dictaminadas * esc, ws = m.sin_dictaminar * esc;
          return (
            <g key={k} className="barra">
              <text x={L - 8} y={y + H / 2 + 4} textAnchor="end" fontSize="13" fill="#16241a">{k}</text>
              {wd > 0 && <rect x={L} y={y} width={wd} height={H} rx="3" fill={C_DICT}><title>{`${k} — Dictaminadas: ${m.dictaminadas}`}</title></rect>}
              {ws > 0 && <rect x={L + wd + (wd > 0 ? 2 : 0)} y={y} width={Math.max(ws - (wd > 0 ? 2 : 0), 1)} height={H} rx="3" fill={C_SIN}><title>{`${k} — Sin dictaminar: ${m.sin_dictaminar}`}</title></rect>}
              <text x={L + wd + ws + 8} y={y + H / 2 + 4} fontSize="13" fontWeight="700" fill="#16241a">{m.derivadas}</text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

/** Columnas apiladas por mes de derivación (solo en la vista anual). */
function ColumnasMensuales({ meses }: { meses: Met[] }) {
  const max = Math.max(1, ...meses.map((m) => m.derivadas));
  const W = 400, Hh = 170, base = Hh - 22, cw = W / 12, bw = 22, alto = base - 14;
  return (
    <figure className="graf">
      <figcaption>Derivadas por mes</figcaption>
      <Leyenda />
      <svg viewBox={`0 0 ${W} ${Hh}`} role="img" aria-label="Derivadas por mes" style={{ width: '100%' }}>
        <line x1="0" x2={W} y1={base} y2={base} stroke="#cfd8cf" />
        {meses.map((m, i) => {
          const x = i * cw + (cw - bw) / 2, hd = (m.dictaminadas / max) * alto, hs = (m.sin_dictaminar / max) * alto;
          return (
            <g key={i}>
              {hs > 0 && <rect x={x} y={base - hd - hs} width={bw} height={Math.max(hs - (hd > 0 ? 2 : 0), 1)} rx="3" fill={C_SIN}><title>{`${MESES_C[i]} — Sin dictaminar: ${m.sin_dictaminar}`}</title></rect>}
              {hd > 0 && <rect x={x} y={base - hd} width={bw} height={hd} rx="3" fill={C_DICT}><title>{`${MESES_C[i]} — Dictaminadas: ${m.dictaminadas}`}</title></rect>}
              {m.derivadas > 0 && <text x={x + bw / 2} y={base - hd - hs - 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="#16241a">{m.derivadas}</text>}
              <text x={x + bw / 2} y={Hh - 6} textAnchor="middle" fontSize="11" fill="#52514e">{MESES_C[i]}</text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

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
        <div className="grid2 graficos">
          <Dona m={d.general} titulo="Avance general" />
          <Dona m={d.tormenta} titulo="Avance tormenta" />
        </div>
        {!d.periodo.mes && <ColumnasMensuales meses={d.por_mes} />}
        <BarrasApiladas titulo="Por distrito" datos={Object.entries(d.por_distrito).sort()} />
        <BarrasApiladas titulo="Por prioridad" datos={['Alta', 'Media', 'Baja'].filter((k) => d.por_prioridad[k]).map((k) => [k, d.por_prioridad[k]] as [string, Met])} />
        <h2>Detalle por distrito (tabla)</h2>
        <div className="scroll-x"><table className="tabla"><thead><tr><th>Distrito</th><th>Derivadas</th><th>Dictaminadas</th><th>Sin dictaminar</th></tr></thead>
          <tbody>{Object.entries(d.por_distrito).sort().map(([k, m]) => <tr key={k}><td>{k}</td><td>{m.derivadas}</td><td>{m.dictaminadas}</td><td>{m.sin_dictaminar}</td></tr>)}</tbody></table></div>
      </>)}
    </section>
  );
}
