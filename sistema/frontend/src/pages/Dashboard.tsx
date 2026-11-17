import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { CircleCheck, CloudLightning, Gauge, Hourglass, Inbox } from 'lucide-react';
import { api } from '../lib/api';
import { textoError } from '../components/ui';

interface Met { derivadas: number; dictaminadas: number; sin_dictaminar: number }
interface Datos { periodo: { anio: number; mes: number | null }; general: Met; tormenta: Met; por_distrito: Record<string, Met>; por_prioridad: Record<string, Met>; por_mes: Met[] }
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const MESES_C = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const pct = (a: number, t: number) => (t ? Math.round((a / t) * 100) : 0);
const num = (n: number) => n.toLocaleString('es-AR');

/*
 * Gráficos (skill dataviz, 16/11/2026): dos series en orden fijo — Dictaminadas (verde de la marca) y Sin dictaminar
 * (azul). Par validado con scripts/validate_palette.js sobre fondo blanco: CVD ΔE 23, visión normal ΔE 24.4, contraste ≥ 3:1.
 * Nunca solo color: leyenda, valores escritos, cartel al pasar y tabla. Los colores viven en styles.css (--serie-*).
 */
type Tip = { x: number; y: number; titulo: string; filas: [string, string][] } | null;

function Leyenda() {
  return (
    <div className="viz-leyenda" aria-hidden="true">
      <span><i className="sw sw-dict" />Dictaminadas</span>
      <span><i className="sw sw-sin" />Sin dictaminar</span>
    </div>
  );
}

/** Contenedor de gráfico: título, leyenda, el gráfico con su cartel y la vista de tabla. */
function Panel({ titulo, subtitulo, leyenda = true, tabla, children, tip }: { titulo: string; subtitulo?: string; leyenda?: boolean; tabla: ReactNode; children: ReactNode; tip: Tip }) {
  return (
    <figure className="panel">
      <figcaption><span className="panel-titulo">{titulo}</span>{subtitulo && <span className="ayuda">{subtitulo}</span>}</figcaption>
      {leyenda && <Leyenda />}
      <div className="viz">{children}{tip && (
        <div className="viz-tip" role="status" style={{ left: tip.x, top: tip.y }}>
          <strong>{tip.titulo}</strong>{tip.filas.map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}
        </div>)}</div>
      <details className="viz-tabla"><summary>Ver como tabla</summary>{tabla}</details>
    </figure>
  );
}

const filasTip = (m: Met): [string, string][] => [['Dictaminadas', num(m.dictaminadas)], ['Sin dictaminar', num(m.sin_dictaminar)], ['Avance', `${pct(m.dictaminadas, m.derivadas)} %`]];
const Tabla = ({ col, datos }: { col: string; datos: [string, Met][] }) => (
  <div className="scroll-x"><table className="tabla"><thead><tr><th>{col}</th><th>Derivadas</th><th>Dictaminadas</th><th>Sin dictaminar</th><th>Avance</th></tr></thead>
    <tbody>{datos.map(([k, m]) => <tr key={k}><td>{k}</td><td>{num(m.derivadas)}</td><td>{num(m.dictaminadas)}</td><td>{num(m.sin_dictaminar)}</td><td>{pct(m.dictaminadas, m.derivadas)} %</td></tr>)}</tbody></table></div>
);

/** Rectángulo con el extremo de datos redondeado (4 px) y el lado de la base recto. */
function barra(x: number, y: number, w: number, h: number, extremo: 'derecha' | 'arriba' | 'ninguno') {
  const r = Math.min(4, extremo === 'derecha' ? w / 2 : h / 2, extremo === 'derecha' ? h / 2 : w / 2);
  if (extremo === 'ninguno' || r <= 0) return `M${x},${y}h${w}v${h}h${-w}z`;
  if (extremo === 'derecha') return `M${x},${y}h${w - r}a${r},${r} 0 0 1 ${r},${r}v${h - 2 * r}a${r},${r} 0 0 1 ${-r},${r}h${-(w - r)}z`;
  return `M${x},${y + h}v${-(h - r)}a${r},${r} 0 0 1 ${r},${-r}h${w - 2 * r}a${r},${r} 0 0 1 ${r},${r}v${h - r}z`;
}

/** Cartel al pasar + ancho real del contenedor: el gráfico se dibuja en píxeles reales, así la letra no se agranda ni se achica. */
function useTip() {
  const [tip, setTip] = useState<Tip>(null);
  const [ancho, setAncho] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const medir = () => setAncho(Math.round(el.getBoundingClientRect().width));
    medir();
    const ro = new ResizeObserver(medir); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const mostrar = (e: React.MouseEvent | React.FocusEvent, titulo: string, m: Met) => {
    const caja = (e.currentTarget as Element).getBoundingClientRect(), base = ref.current?.getBoundingClientRect();
    if (!base) return;
    setTip({ x: Math.min(caja.left - base.left + caja.width / 2, base.width - 90), y: caja.top - base.top, titulo, filas: filasTip(m) });
  };
  return { tip, ref, ancho, mostrar, ocultar: () => setTip(null) };
}

/** Barras horizontales apiladas, ordenadas de mayor a menor, con total y % de avance escritos al final. */
function BarrasApiladas({ titulo, col, datos }: { titulo: string; col: string; datos: [string, Met][] }) {
  const { tip, ref, ancho, mostrar, ocultar } = useTip();
  const max = Math.max(1, ...datos.map(([, m]) => m.derivadas));
  const W = Math.max(ancho, 280), L = 84, R = 84, H = 22, G = 14, esc = (W - L - R) / max;
  return (
    <Panel titulo={titulo} tip={tip} tabla={<Tabla col={col} datos={datos} />}>
      <div ref={ref} onMouseLeave={ocultar}>
        <svg width={W} height={datos.length * (H + G)} viewBox={`0 0 ${W} ${datos.length * (H + G)}`} role="img" aria-label={`${titulo}: ${datos.map(([k, m]) => `${k} ${m.dictaminadas} de ${m.derivadas}`).join('; ')}`}>
          {datos.map(([k, m], i) => {
            const y = i * (H + G) + G / 2, wd = m.dictaminadas * esc, ws = m.sin_dictaminar * esc, gap = wd > 0 && ws > 0 ? 2 : 0;
            return (
              <g key={k} className="viz-fila" tabIndex={0} onMouseEnter={(e) => mostrar(e, k, m)} onFocus={(e) => mostrar(e, k, m)} onBlur={ocultar}>
                <rect x={0} y={y - G / 2} width={W} height={H + G} fill="transparent" />
                <text x={L - 10} y={y + H / 2 + 5} textAnchor="end" className="viz-eje">{k}</text>
                <rect x={L} y={y} width={W - L - R} height={H} rx={4} className="viz-pista" />
                {wd > 0 && <path d={barra(L, y, wd, H, ws > 0 ? 'ninguno' : 'derecha')} className="m-dict" />}
                {ws > 0 && <path d={barra(L + wd + gap, y, Math.max(ws - gap, 1), H, 'derecha')} className="m-sin" />}
                <text x={W - R + 10} y={y + H / 2 + 5} className="viz-valor">{num(m.derivadas)}</text>
                <text x={W} y={y + H / 2 + 5} textAnchor="end" className="viz-eje">{pct(m.dictaminadas, m.derivadas)} %</text>
              </g>
            );
          })}
        </svg>
      </div>
    </Panel>
  );
}

/** Columnas apiladas por mes de derivación (vista anual). */
function ColumnasMensuales({ meses, anio }: { meses: Met[]; anio: number }) {
  const { tip, ref, ancho, mostrar, ocultar } = useTip();
  const max = Math.max(1, ...meses.map((m) => m.derivadas));
  const W = Math.max(ancho, 280), Hh = 220, base = Hh - 26, cw = W / 12, bw = Math.max(10, Math.min(32, cw - 10)), alto = base - 22;
  const datos = meses.map((m, i) => [MESES[i], m] as [string, Met]);
  return (
    <Panel titulo="Derivadas por mes" subtitulo={`Año ${anio}`} tip={tip} tabla={<Tabla col="Mes" datos={datos} />}>
      <div ref={ref} onMouseLeave={ocultar}>
        <svg width={W} height={Hh} viewBox={`0 0 ${W} ${Hh}`} role="img" aria-label={`Derivadas por mes en ${anio}`}>
          {[0.5, 1].map((f) => <line key={f} x1="0" x2={W} y1={base - f * alto} y2={base - f * alto} className="viz-grilla" />)}
          <line x1="0" x2={W} y1={base} y2={base} className="viz-base" />
          {meses.map((m, i) => {
            const x = i * cw + (cw - bw) / 2, hd = (m.dictaminadas / max) * alto, hs = (m.sin_dictaminar / max) * alto, gap = hd > 0 && hs > 0 ? 2 : 0;
            return (
              <g key={i} className="viz-fila" tabIndex={0} onMouseEnter={(e) => mostrar(e, `${MESES[i]} ${anio}`, m)} onFocus={(e) => mostrar(e, `${MESES[i]} ${anio}`, m)} onBlur={ocultar}>
                <rect x={i * cw} y={0} width={cw} height={Hh} fill="transparent" />
                {hd > 0 && <path d={barra(x, base - hd, bw, hd, hs > 0 ? 'ninguno' : 'arriba')} className="m-dict" />}
                {hs > 0 && <path d={barra(x, base - hd - hs, bw, Math.max(hs - gap, 1), 'arriba')} className="m-sin" />}
                {m.derivadas > 0 && <text x={x + bw / 2} y={base - hd - hs - 6} textAnchor="middle" className="viz-valor">{num(m.derivadas)}</text>}
                <text x={x + bw / 2} y={Hh - 6} textAnchor="middle" className="viz-eje">{MESES_C[i]}</text>
              </g>
            );
          })}
        </svg>
      </div>
    </Panel>
  );
}

function Indicador({ icono, titulo, valor, nota, tono }: { icono: ReactNode; titulo: string; valor: string; nota?: ReactNode; tono?: 'dict' | 'sin' }) {
  return (
    <div className={`kpi ${tono ? `kpi-${tono}` : ''}`}>
      <div className="kpi-cab">{icono}<span>{titulo}</span></div>
      <div className="kpi-valor">{valor}</div>
      {nota && <div className="kpi-nota">{nota}</div>}
    </div>
  );
}

function Progreso({ m }: { m: Met }) {
  const p = pct(m.dictaminadas, m.derivadas);
  return (
    <div className="progreso" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p} aria-label={`Avance: ${p} %`}>
      <span style={{ width: `${p}%` }} />
    </div>
  );
}

export function Dashboard() {
  const ahora = new Date();
  const [anio, setAnio] = useState(ahora.getFullYear());
  const [mes, setMes] = useState('');
  const [d, setD] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  useEffect(() => {
    setError(null); setCargando(true);
    api(`/dashboard?anio=${anio}${mes ? `&mes=${mes}` : ''}`).then(setD).catch((e) => setError(textoError(e))).finally(() => setCargando(false));
  }, [anio, mes]);

  const periodo = mes ? `${MESES[Number(mes) - 1]} de ${anio}` : `Año ${anio}`;
  const anios = Array.from({ length: 6 }, (_, i) => ahora.getFullYear() - i);
  const distritos = d ? Object.entries(d.por_distrito).sort((a, b) => b[1].derivadas - a[1].derivadas) : [];
  const prioridades = d ? ['Alta', 'Media', 'Baja'].filter((k) => d.por_prioridad[k]).map((k) => [k, d.por_prioridad[k]] as [string, Met]) : [];

  return (
    <section className="dash" aria-busy={cargando}>
      <div className="dash-cab">
        <div><h1 style={{ margin: 0 }}>Dashboard</h1><p className="ayuda" style={{ margin: 0 }}>Solicitudes derivadas a la Dirección Técnica · {periodo}</p></div>
        <div className="dash-filtros">
          <div><label htmlFor="mes">Mes</label><select id="mes" value={mes} onChange={(e) => setMes(e.target.value)}><option value="">Todo el año</option>{MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></div>
          <div><label htmlFor="anio">Año</label><select id="anio" value={anio} onChange={(e) => setAnio(Number(e.target.value))}>{anios.map((a) => <option key={a}>{a}</option>)}</select></div>
        </div>
      </div>
      {error && <div className="error" role="alert">{error}</div>}
      {cargando && !d && <p role="status">Cargando…</p>}
      {d && (<>
        <div className="kpis">
          <Indicador icono={<Inbox className="ico" aria-hidden />} titulo="Derivadas" valor={num(d.general.derivadas)} nota="Incluye tormenta" />
          <Indicador icono={<CircleCheck className="ico" aria-hidden />} titulo="Dictaminadas" valor={num(d.general.dictaminadas)} tono="dict" />
          <Indicador icono={<Hourglass className="ico" aria-hidden />} titulo="Sin dictaminar" valor={num(d.general.sin_dictaminar)} tono="sin" />
          <Indicador icono={<Gauge className="ico" aria-hidden />} titulo="Avance" valor={`${pct(d.general.dictaminadas, d.general.derivadas)} %`} nota={<Progreso m={d.general} />} />
        </div>

        <div className="tormenta-resumen">
          <div className="fila"><CloudLightning className="ico" aria-hidden /><strong>Protocolo por tormenta</strong></div>
          <div className="tormenta-datos">
            <span><b>{num(d.tormenta.derivadas)}</b> derivadas</span>
            <span><b>{num(d.tormenta.dictaminadas)}</b> dictaminadas</span>
            <span><b>{num(d.tormenta.sin_dictaminar)}</b> sin dictaminar</span>
            <span><b>{pct(d.tormenta.dictaminadas, d.tormenta.derivadas)} %</b> de avance</span>
          </div>
          <Progreso m={d.tormenta} />
        </div>

        <div className="dash-grilla">
          {!d.periodo.mes && <div className="dash-ancho"><ColumnasMensuales meses={d.por_mes} anio={anio} /></div>}
          <BarrasApiladas titulo="Por distrito" col="Distrito" datos={distritos} />
          <BarrasApiladas titulo="Por prioridad" col="Prioridad" datos={prioridades} />
        </div>
        <p className="ayuda">Cada re-derivación por vencimiento cuenta como un evento aparte, aunque sea el mismo Número de SUA-Año.</p>
      </>)}
    </section>
  );
}
