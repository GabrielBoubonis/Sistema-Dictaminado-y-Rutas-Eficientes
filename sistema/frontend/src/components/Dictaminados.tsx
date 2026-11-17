import { useEffect, useMemo, useState } from 'react';
import { CloudLightning, Download, FileCheck2 } from 'lucide-react';
import { api, descargarPdfDictamen } from '../lib/api';
import { Paginacion, Prioridad, fechaCorta, fechaHora, textoError } from './ui';
import catalogos from '../catalogos.json';

interface Dictaminada {
  numero_sua: string; anio: number; direccion: string; distrito: string; prioridad: string; es_tormenta: boolean;
  dictamen: { id_dictamen: number; autor: string; fecha_emision: string; fecha_firma: string; especie: string; resultado: string };
}
const POR_PAGINA = 30;

/** RF-64: solicitudes dictaminadas con descarga del PDF del dictamen vigente (Operador, Jefe, Lector y Administrador). */
export function ListaDictaminados() {
  const [datos, setDatos] = useState<Dictaminada[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [distrito, setDistrito] = useState('');
  const [q, setQ] = useState('');
  const [pagina, setPagina] = useState(1);
  const [bajando, setBajando] = useState<number | null>(null);

  useEffect(() => {
    api('/dictaminados').then(setDatos).catch((e) => setError(navigator.onLine ? textoError(e) : 'Sin conexión: la lista de dictaminados necesita señal.'))
      .finally(() => setCargando(false));
  }, []);

  const filtradas = useMemo(() => datos.filter((s) => (!distrito || s.distrito === distrito)
    && (!q || `${s.direccion} ${s.numero_sua} ${s.dictamen.autor}`.toLowerCase().includes(q.toLowerCase()))), [datos, distrito, q]);
  const pagina_ = filtradas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

  const bajar = async (s: Dictaminada) => {
    setBajando(s.dictamen.id_dictamen); setError(null);
    try { await descargarPdfDictamen(s.dictamen.id_dictamen, `dictamen-${s.numero_sua}-${s.anio}.pdf`); }
    catch (e) { setError(textoError(e)); }
    finally { setBajando(null); }
  };

  return (
    <div>
      {error && <div className="error" role="alert">{error}</div>}
      <div className="grid2">
        <div><label htmlFor="d-d">Distrito</label><select id="d-d" value={distrito} onChange={(e) => { setDistrito(e.target.value); setPagina(1); }}><option value="">Todos</option>{catalogos.distritos.map((d) => <option key={d}>{d}</option>)}</select></div>
        <div><label htmlFor="d-q">Buscar</label><input id="d-q" type="text" placeholder="Dirección, N.° de SUA o ingeniero" value={q} onChange={(e) => { setQ(e.target.value); setPagina(1); }} /></div>
      </div>
      <Paginacion total={filtradas.length} pagina={pagina} porPagina={POR_PAGINA} onPagina={setPagina} />
      {cargando && <p role="status">Cargando…</p>}
      {!cargando && !error && !filtradas.length && <p className="vacio">No hay solicitudes dictaminadas con esos filtros.</p>}
      {pagina_.map((s) => (
        <article key={`${s.numero_sua}-${s.anio}`} className="card">
          <div className="fila sb">
            <strong>{s.numero_sua}-{s.anio}</strong>
            <span className="fila"><Prioridad p={s.prioridad} />{s.es_tormenta && <span className="badge off"><CloudLightning className="ico" aria-hidden /> Tormenta</span>}<span className="badge"><FileCheck2 className="ico" aria-hidden /> Dictaminada</span></span>
          </div>
          <div>{s.direccion}</div>
          <div className="ayuda">{s.distrito} · {s.dictamen.especie} · {s.dictamen.resultado}</div>
          <div className="ayuda">Firmado por {s.dictamen.autor} el {fechaHora(s.dictamen.fecha_firma)} (dictamen del {fechaCorta(s.dictamen.fecha_emision)})</div>
          <div className="fila" style={{ marginTop: 'var(--space-2)' }}>
            <button className="btn sec chico" onClick={() => bajar(s)} disabled={bajando === s.dictamen.id_dictamen}>
              <Download className="ico" aria-hidden /> {bajando === s.dictamen.id_dictamen ? 'Descargando…' : 'Descargar PDF'}
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}

/** Pantalla propia para quienes no ven Solicitudes (Lector y Administrador). */
export function Dictaminados() {
  return (
    <section aria-labelledby="t-dict">
      <h1 id="t-dict">Dictaminados</h1>
      <p className="ayuda">Solicitudes ya dictaminadas, con el PDF del dictamen vigente.</p>
      <ListaDictaminados />
    </section>
  );
}
