import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Mapa, type Marcador } from './Mapa';
import { Modal, Prioridad, textoError } from './ui';
import { api } from '../lib/api';
import type { Ruta } from '../lib/datos';

export function RutaActiva({ ruta, firmadasLocal, alCambiar }: { ruta: Ruta; firmadasLocal: string[]; alCambiar: () => void }) {
  const [confirmar, setConfirmar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  const hecha = (s: Ruta['solicitudes'][number]) => s.liberada || firmadasLocal.includes(`${s.numero_sua}-${s.anio}`);
  const { marcadores, linea } = useMemo(() => {
    const { partida } = ruta;
    const titulo = partida.tipo === 'Sede' ? 'Partida: Parques y Paseos (Mariano Moreno 2350)' : 'Partida: tu ubicación al generar la ruta';
    const m: Marcador[] = [{ lat: partida.lat, lng: partida.lng, etiqueta: 'P', clase: 'sede', titulo }];
    const l: Array<[number, number]> = [[partida.lat, partida.lng]];
    for (const s of ruta.solicitudes) if (s.latitud !== null) {
      m.push({ lat: s.latitud!, lng: s.longitud!, etiqueta: String(s.orden), clase: hecha(s) ? 'hecho' : '', titulo: s.direccion });
      l.push([s.latitud!, s.longitud!]);
    }
    return { marcadores: m, linea: ruta.optimizada ? l : undefined };
  }, [ruta, firmadasLocal]); // eslint-disable-line

  const restablecer = async () => {
    setTrabajando(true);
    try { await api(`/rutas/${ruta.id_ruta}/restablecer`, { body: {} }); setConfirmar(false); alCambiar(); }
    catch (e) { setError(textoError(e)); setConfirmar(false); }
    setTrabajando(false);
  };
  const hechas = ruta.solicitudes.filter(hecha).length;
  return (
    <section>
      <h1>{ruta.tipo === 'Tormenta' ? '⛈ Ruta de tormenta' : 'Mi ruta de hoy'}</h1>
      <div className="fila">
        <span className="badge">{ruta.modo_desplazamiento === 'Caminando' ? '🚶 A pie' : '🚗 En vehículo'}</span>
        <span className="badge info">{hechas} de {ruta.solicitudes.length} dictaminadas</span>
        {ruta.optimizada && ruta.distancia_total_m !== null
          ? <span className="badge">{(ruta.distancia_total_m / 1000).toFixed(1)} km · {Math.round((ruta.tiempo_total_s ?? 0) / 60)} min desde {ruta.partida.tipo === 'Sede' ? 'Parques y Paseos' : 'tu ubicación'}</span>
          : <span className="badge warn">Orden sin optimizar (el servicio de mapas no respondió)</span>}
      </div>
      <Mapa marcadores={marcadores} linea={linea} etiquetaAria="Mapa de la ruta" />
      {error && <div className="error" role="alert">{error}</div>}
      {ruta.solicitudes.map((s) => (
        <article key={s.numero_sua + s.anio} className={`card prio-${s.prioridad}`} style={{ opacity: hecha(s) ? 0.6 : 1 }}>
          <div className="fila sb"><strong>{s.orden}. {s.direccion}</strong><Prioridad p={s.prioridad} /></div>
          <div className="ayuda">{s.numero_sua}-{s.anio} · {s.distrito}</div>
          <div>{s.descripcion_reclamo}</div>
          <div style={{ marginTop: '.5rem' }}>
            {hecha(s)
              ? <span className="badge">✓ {s.liberada ? (s.motivo_liberacion ?? 'Liberada') : 'Firmado (pendiente de enviar)'}</span>
              : <Link className="btn chico" to={`/dictamen/${s.numero_sua}/${s.anio}`}>Dictaminar</Link>}
          </div>
        </article>
      ))}
      <button className="btn rojo block" onClick={() => setConfirmar(true)} disabled={!navigator.onLine}>Restablecer ruta</button>
      <p className="ayuda">Restablecer libera las solicitudes que todavía no dictaminaste. Las solicitudes sin dictaminar se liberan solas a las 18:00.</p>
      {confirmar && (
        <Modal titulo="¿Restablecer la ruta?" onCerrar={() => setConfirmar(false)}>
          <p>Se descarta la ruta y se liberan las solicitudes no dictaminadas para que otros ingenieros puedan tomarlas.</p>
          <div className="fila"><button className="btn rojo" disabled={trabajando} onClick={restablecer}>Sí, restablecer</button><button className="btn sec" onClick={() => setConfirmar(false)}>Cancelar</button></div>
        </Modal>
      )}
    </section>
  );
}
