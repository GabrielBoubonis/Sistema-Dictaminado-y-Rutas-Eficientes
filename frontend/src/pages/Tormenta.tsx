import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../auth';
import { Estado, Prioridad, fechaCorta, textoError } from '../components/ui';
import type { Solicitud } from '../lib/datos';

export function Tormenta() {
  const { usuario } = useAuth();
  const [d, setD] = useState<{ hay_pendientes: boolean; solicitudes: Solicitud[] } | null>(null);
  const [modo, setModo] = useState<'Caminando' | 'Vehículo' | null>(null);
  const [total, setTotal] = useState(10);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const puedeRuta = usuario && ['Operador', 'Jefe'].includes(usuario.rol);
  const cargar = () => api('/tormenta').then(setD).catch((e) => setError(textoError(e)));
  useEffect(() => { void cargar(); }, []);

  const generar = async () => {
    setError(null);
    try { await api('/tormenta/rutas', { body: { modo, total } }); setOk(true); void cargar(); } catch (e) { setError(textoError(e)); }
  };
  return (
    <section>
      <h1>⛈ Protocolo por tormenta {d?.hay_pendientes && <span className="tormenta-pulso" aria-label="Hay pendientes" />}</h1>
      <p className="ayuda">Solicitudes derivadas con la etiqueta “emergencia por tormenta”. No aparecen en el listado general.</p>
      {error && <div className="error" role="alert">{error}</div>}
      {ok && <div className="ok" role="status">Ruta de tormenta generada. <Link to="/ruta">Ver mi ruta</Link></div>}
      {puedeRuta && d?.hay_pendientes && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Generar ruta de tormenta</h2>
          <p className="ayuda">Indicá solo la cantidad: se toman siempre las más antiguas primero.</p>
          <div className="toggle" role="group" aria-label="Modo de desplazamiento">
            <button type="button" className={modo === 'Caminando' ? 'activo' : ''} aria-pressed={modo === 'Caminando'} onClick={() => setModo('Caminando')}>🚶 A pie</button>
            <button type="button" className={modo === 'Vehículo' ? 'activo' : ''} aria-pressed={modo === 'Vehículo'} onClick={() => setModo('Vehículo')}>🚗 En vehículo</button>
          </div>
          <label htmlFor="tot">Cantidad de solicitudes</label>
          <input id="tot" type="number" min={1} max={100} value={total} onChange={(e) => setTotal(Math.max(1, Math.min(100, Math.floor(Number(e.target.value) || 1))))} />
          <button className="btn block" style={{ marginTop: '.8rem' }} disabled={!modo || !navigator.onLine} onClick={generar}>Generar ruta de tormenta</button>
        </div>
      )}
      {d && !d.solicitudes.length && <p className="vacio">No hay solicitudes de tormenta pendientes.</p>}
      {d?.solicitudes.map((s) => (
        <Link key={s.numero_sua + s.anio} to={`/solicitudes/${s.numero_sua}/${s.anio}`} style={{ textDecoration: 'none', color: 'inherit' }}>
          <article className={`card click prio-${s.prioridad}`}>
            <div className="fila sb"><strong>{s.numero_sua}-{s.anio}</strong><span className="fila"><Prioridad p={s.prioridad} /><Estado estado={s.estado} /></span></div>
            <div>{s.direccion}</div>
            <div className="ayuda">{s.distrito} · derivada el {fechaCorta(s.fecha_ultima_derivacion)}{s.reservada_por ? ` · 🔒 ruta de ${s.reservada_por}` : ''}{s.sin_ubicar ? ' · 📍 sin ubicar' : ''}</div>
          </article>
        </Link>
      ))}
    </section>
  );
}
