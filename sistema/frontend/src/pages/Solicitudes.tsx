import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { cargarSolicitudes, type Solicitud } from '../lib/datos';
import { Estado, Paginacion, Prioridad, fechaCorta, textoError } from '../components/ui';
import catalogos from '../catalogos.json';

const POR_PAGINA = 30; // paginación explícita (diseño-ui.md, módulo 2)

export function Solicitudes() {
  const [datos, setDatos] = useState<Solicitud[]>([]);
  const [desdeCache, setDesdeCache] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [pestana, setPestana] = useState<'todas' | 'Pendiente' | 'Pendiente-revisión'>('todas');
  const [distrito, setDistrito] = useState('');
  const [prioridad, setPrioridad] = useState('');
  const [anio, setAnio] = useState('');
  const [q, setQ] = useState('');
  const [pagina, setPagina] = useState(1);

  useEffect(() => {
    cargarSolicitudes().then((r) => { setDatos(r.datos ?? []); setDesdeCache(r.desdeCache); })
      .catch((e) => setError(textoError(e))).finally(() => setCargando(false));
  }, []);

  const filtradas = useMemo(() => datos.filter((s) =>
    (pestana === 'todas' || s.estado === pestana) && (!distrito || s.distrito === distrito) && (!prioridad || s.prioridad === prioridad)
    && (!anio || String(s.anio) === anio) && (!q || (s.direccion + ' ' + s.numero_sua).toLowerCase().includes(q.toLowerCase())),
  ), [datos, pestana, distrito, prioridad, anio, q]);
  const anios = [...new Set(datos.map((s) => s.anio))].sort().reverse();
  const pagina_ = filtradas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);
  const cambiar = <T,>(f: (v: T) => void) => (v: T) => { f(v); setPagina(1); };

  return (
    <section aria-labelledby="t">
      <h1 id="t">Solicitudes</h1>
      {desdeCache && <div className="aviso">Sin conexión: se muestra la última lista descargada.</div>}
      {error && <div className="error" role="alert">{error}</div>}
      <div className="tabs" role="tablist">
        {([['todas', 'Todas'], ['Pendiente', 'Pendientes'], ['Pendiente-revisión', 'En revisión']] as const).map(([k, t]) => (
          <button key={k} role="tab" aria-selected={pestana === k} className={pestana === k ? 'activo' : ''} onClick={() => cambiar(setPestana)(k)}>{t}</button>
        ))}
      </div>
      <div className="grid2">
        <div><label htmlFor="f-d">Distrito</label><select id="f-d" value={distrito} onChange={(e) => cambiar(setDistrito)(e.target.value)}><option value="">Todos</option>{catalogos.distritos.map((d) => <option key={d}>{d}</option>)}</select></div>
        <div><label htmlFor="f-p">Prioridad</label><select id="f-p" value={prioridad} onChange={(e) => cambiar(setPrioridad)(e.target.value)}><option value="">Todas</option>{catalogos.nivel_prioridad.map((d) => <option key={d}>{d}</option>)}</select></div>
        <div><label htmlFor="f-a">Año</label><select id="f-a" value={anio} onChange={(e) => cambiar(setAnio)(e.target.value)}><option value="">Todos</option>{anios.map((a) => <option key={a}>{a}</option>)}</select></div>
        <div><label htmlFor="f-q">Buscar</label><input id="f-q" type="text" placeholder="Dirección o N.° de SUA" value={q} onChange={(e) => cambiar(setQ)(e.target.value)} /></div>
      </div>
      <Paginacion total={filtradas.length} pagina={pagina} porPagina={POR_PAGINA} onPagina={setPagina} />
      {cargando && <p role="status">Cargando…</p>}
      {!cargando && !filtradas.length && <p className="vacio">No hay solicitudes con esos filtros.</p>}
      {pagina_.map((s) => (
        <Link key={`${s.numero_sua}-${s.anio}`} to={`/solicitudes/${s.numero_sua}/${s.anio}`} style={{ textDecoration: 'none', color: 'inherit' }}>
          <article className={`card click prio-${s.prioridad}`}>
            <div className="fila sb"><strong>{s.numero_sua}-{s.anio}</strong><span className="fila"><Prioridad p={s.prioridad} /><Estado estado={s.estado} /></span></div>
            <div>{s.direccion}</div>
            <div className="ayuda">{s.distrito} · derivada el {fechaCorta(s.fecha_ultima_derivacion)}
              {s.reservada_por && <> · 🔒 en la ruta de {s.reservada_por}</>}
              {s.sin_ubicar && <> · 📍 sin ubicar en el mapa</>}
              {s.en_conflicto && <> · ⚖ esperando decisión del Jefe</>}</div>
          </article>
        </Link>
      ))}
    </section>
  );
}
