import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../auth';
import { api, ErrorRed } from '../lib/api';
import { cargarRutaActiva, cargarSolicitudes, firmadasLocales, type Ruta, type Solicitud } from '../lib/datos';
import { RutaActiva } from '../components/RutaActiva';
import { Mapa } from '../components/Mapa';
import { Modal, textoError } from '../components/ui';
import { puntoEnPoligono } from '../lib/geo';
import { cacheSet } from '../lib/db';
import catalogos from '../catalogos.json';

type Cant = { Alta: number; Media: number; Baja: number };

export function MiRuta() {
  const { usuario } = useAuth();
  const [ruta, setRuta] = useState<Ruta | null | undefined>(undefined);
  const [desdeCache, setDesdeCache] = useState(false);
  const [firmadas, setFirmadas] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const mensaje = (useLocation().state as { mensaje?: string } | null)?.mensaje;

  const cargar = async () => {
    try {
      const r = await cargarRutaActiva(usuario!.nombre_usuario);
      setRuta(r.datos ?? null); setDesdeCache(r.desdeCache);
      setFirmadas(await firmadasLocales());
    } catch (e) { setError(textoError(e)); setRuta(null); }
  };
  useEffect(() => { void cargar(); }, []); // eslint-disable-line

  if (ruta === undefined) return <p role="status">Cargando…</p>;
  if (ruta) return (<>
    {mensaje && <div className="ok" role="status">{mensaje}</div>}
    {desdeCache && <div className="aviso">Sin conexión: se muestra tu ruta guardada en el captor.</div>}
    {error && <div className="error" role="alert">{error}</div>}
    <RutaActiva ruta={ruta} firmadasLocal={firmadas} alCambiar={async () => { await cacheSet(`ruta:${usuario!.nombre_usuario}`, null); await cargar(); }} />
  </>);
  return <GenerarRuta alGenerar={cargar} />;
}

function GenerarRuta({ alGenerar }: { alGenerar: () => void }) {
  const [modo, setModo] = useState<'Caminando' | 'Vehículo' | null>(null);
  const [distrito, setDistrito] = useState('');
  const [cant, setCant] = useState<Cant>({ Alta: 0, Media: 0, Baja: 0 });
  const [zona, setZona] = useState<Array<[number, number]>>([]);
  const [dibujando, setDibujando] = useState(false);
  const [sols, setSols] = useState<Solicitud[]>([]);
  const [modal, setModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const online = navigator.onLine;

  useEffect(() => { cargarSolicitudes().then((r) => setSols(r.datos ?? [])).catch(() => {}); }, []);

  // Resumen en vivo: cuántas solicitudes cumplen los criterios (diseño-ui.md, módulo 3)
  const disponibles = useMemo(() => {
    const base = sols.filter((s) => !s.reservada_por && !s.sin_ubicar && !s.en_conflicto && (!distrito || s.distrito === distrito)
      && (zona.length < 3 || puntoEnPoligono({ lat: s.latitud!, lng: s.longitud! }, zona)));
    return { Alta: base.filter((s) => s.prioridad === 'Alta').length, Media: base.filter((s) => s.prioridad === 'Media').length, Baja: base.filter((s) => s.prioridad === 'Baja').length };
  }, [sols, distrito, zona]);
  const total = cant.Alta + cant.Media + cant.Baja;
  const alcanzan = (['Alta', 'Media', 'Baja'] as const).reduce((a, p) => a + Math.min(cant[p], disponibles[p]), 0);
  const puede = !!modo && total > 0 && alcanzan > 0 && online;

  const generar = async () => {
    setTrabajando(true); setError(null);
    try {
      await api('/rutas', { body: { modo, ...(distrito ? { distrito } : {}), ...(zona.length >= 3 ? { zona } : {}), cantidades: cant } });
      setModal(false); alGenerar();
    } catch (e) { setError(e instanceof ErrorRed ? 'Generar una ruta requiere conexión a internet.' : textoError(e)); setModal(false); }
    setTrabajando(false);
  };
  const set = (p: keyof Cant, v: string) => setCant({ ...cant, [p]: Math.max(0, Math.min(100, Math.floor(Number(v) || 0))) });

  return (
    <section>
      <h1>Generar ruta de trabajo</h1>
      {!online && <div className="aviso">Generar o confirmar una ruta requiere conexión a internet.</div>}
      {error && <div className="error" role="alert">{error}</div>}
      <h2>Modo de desplazamiento <span className="ayuda">(obligatorio)</span></h2>
      <div className="toggle" role="group" aria-label="Modo de desplazamiento">
        <button type="button" className={modo === 'Caminando' ? 'activo' : ''} aria-pressed={modo === 'Caminando'} onClick={() => setModo('Caminando')}>🚶 A pie</button>
        <button type="button" className={modo === 'Vehículo' ? 'activo' : ''} aria-pressed={modo === 'Vehículo'} onClick={() => setModo('Vehículo')}>🚗 En vehículo</button>
      </div>
      <h2>Distrito <span className="ayuda">(opcional)</span></h2>
      <select aria-label="Distrito" value={distrito} onChange={(e) => setDistrito(e.target.value)}><option value="">Todos los distritos</option>{catalogos.distritos.map((d) => <option key={d}>{d}</option>)}</select>
      <h2>Cantidad por prioridad</h2>
      <div className="grid2">
        {(['Alta', 'Media', 'Baja'] as const).map((p) => (
          <div key={p}><label htmlFor={`c-${p}`}>{p} <span className="ayuda">({disponibles[p]} disponibles)</span></label>
            <input id={`c-${p}`} type="number" inputMode="numeric" min={0} max={100} value={cant[p]} onChange={(e) => set(p, e.target.value)} /></div>
        ))}
      </div>
      <h2>Zona en el mapa <span className="ayuda">(opcional)</span></h2>
      <div className="fila">
        <button type="button" className={`btn chico ${dibujando ? '' : 'sec'}`} onClick={() => setDibujando(!dibujando)}>{dibujando ? 'Terminar dibujo' : 'Dibujar zona'}</button>
        {zona.length > 0 && <button type="button" className="btn sec chico" onClick={() => setZona([])}>Borrar zona</button>}
        <span className="ayuda">{dibujando ? 'Tocá el mapa para marcar los vértices (mínimo 3).' : zona.length >= 3 ? `Zona de ${zona.length} puntos` : ''}</span>
      </div>
      <Mapa poligono={zona} onPoligono={dibujando ? setZona : undefined} etiquetaAria="Mapa para dibujar la zona" />
      <div className={total && !alcanzan ? 'error' : 'card'} role="status">
        {total === 0 ? 'Indicá cuántas solicitudes querés por prioridad.' : alcanzan === 0 ? 'No hay solicitudes disponibles con esos criterios.'
          : `${alcanzan} solicitud${alcanzan > 1 ? 'es' : ''} entrará${alcanzan > 1 ? 'n' : ''} en la ruta${alcanzan < total ? ` (pediste ${total}, hay menos disponibles)` : ''}.`}
      </div>
      <button className="btn block" disabled={!puede} onClick={() => setModal(true)}>Generar ruta</button>
      {modal && (
        <Modal titulo="Confirmar ruta" onCerrar={() => setModal(false)}>
          <p>Para tu ruta de hoy, <strong>{modo === 'Caminando' ? 'a pie' : 'en vehículo'}</strong>, se van a reservar {alcanzan} solicitudes y dejarán de estar disponibles para otros ingenieros.</p>
          <div className="fila"><button className="btn" disabled={trabajando} onClick={generar}>{trabajando ? 'Calculando…' : 'Confirmar'}</button><button className="btn sec" onClick={() => setModal(false)}>Cancelar</button></div>
        </Modal>
      )}
    </section>
  );
}
