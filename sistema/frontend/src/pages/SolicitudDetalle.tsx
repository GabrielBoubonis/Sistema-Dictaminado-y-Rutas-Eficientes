import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, descargarBlob } from '../lib/api';
import { useAuth } from '../auth';
import { Estado, Modal, Prioridad, fechaCorta, fechaHora, textoError } from '../components/ui';
import { Mapa } from '../components/Mapa';

interface DictamenResumen {
  id_dictamen: number; nombre_usuario: string; fecha_emision: string; fecha_firma: string; vigente: boolean | null; estado_sincronizacion: string;
  firmado_sin_conexion: boolean; especie: { nombre_comun: string }; es_extraccion: boolean; es_sin_trabajo: boolean; motivo_extraccion: string | null;
  motivo_sin_trabajo: string | null; trabajos_aereos: string[]; trabajos_subterraneos: { tipo_trabajo: string; distancia_borde: number | null }[];
  complejidad: string; nivel_prioridad: string; nivel_dano_vereda: string | null; observaciones: string | null; fotos: { orden: number; url: string }[];
}

function ResumenDictamen({ d, acciones }: { d: DictamenResumen; acciones?: React.ReactNode }) {
  const intervencion = d.es_extraccion ? `Extracción (${d.motivo_extraccion})` : d.es_sin_trabajo ? `Sin trabajo (${d.motivo_sin_trabajo})`
    : [...d.trabajos_aereos, ...d.trabajos_subterraneos.map((t) => t.tipo_trabajo + (t.distancia_borde ? ` ${t.distancia_borde} m` : ''))].join('; ');
  return (
    <div className="card">
      <div className="fila sb"><strong>{d.nombre_usuario}</strong>
        <span className="badge">{d.vigente === true ? 'Vigente' : d.vigente === null ? 'Pendiente de elección' : d.estado_sincronizacion === 'integridad_no_verificada' ? 'Integridad no verificada' : 'No vigente'}</span></div>
      <div className="ayuda">Emitido {fechaCorta(d.fecha_emision)} · firmado {fechaHora(d.fecha_firma)}{d.firmado_sin_conexion ? ' · firmado sin conexión' : ''}</div>
      <div>Especie: {d.especie.nombre_comun} · Daño en vereda: {d.nivel_dano_vereda ?? '—'} · Complejidad: {d.complejidad} · Prioridad: {d.nivel_prioridad}</div>
      <div>Intervención: {intervencion || '—'}</div>
      {d.observaciones && <div className="ayuda">“{d.observaciones}”</div>}
      <div className="fila" style={{ marginTop: '.5rem' }}>{acciones}</div>
    </div>
  );
}

export function SolicitudDetalle() {
  const { sua, anio } = useParams();
  const { usuario } = useAuth();
  const [s, setS] = useState<any>(null);
  const [historial, setHistorial] = useState<DictamenResumen[]>([]);
  const [conflicto, setConflicto] = useState<DictamenResumen[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [elegir, setElegir] = useState<DictamenResumen | null>(null);
  const puedeDictaminar = usuario && ['Operador', 'Jefe'].includes(usuario.rol);

  const cargar = async () => {
    try {
      setS(await api(`/solicitudes/${sua}/${anio}`));
      setHistorial(await api(`/dictamenes/${sua}/${anio}/historial`));
      if (usuario?.rol === 'Jefe') { const c = await api(`/dictamenes/${sua}/${anio}/conflicto`); setConflicto(c.hay_conflicto ? c.dictamenes : []); }
    } catch (e) { setError(textoError(e)); }
  };
  useEffect(() => { void cargar(); }, [sua, anio]); // eslint-disable-line

  const abrirPdf = async (id: number) => { try { window.open(await descargarBlob(`/dictamenes/${id}/pdf`), '_blank'); } catch (e) { setError(textoError(e)); } };
  const confirmar = async () => {
    if (!elegir) return;
    try { await api(`/dictamenes/${elegir.id_dictamen}/vigente`, { body: {} }); setOk('Listo: el dictamen elegido quedó vigente.'); setElegir(null); await cargar(); }
    catch (e) { setError(textoError(e)); setElegir(null); }
  };

  if (error && !s) return <div className="error" role="alert">{error}</div>;
  if (!s) return <p role="status">Cargando…</p>;
  const hayConflicto = s.dictamenes?.some((d: any) => d.vigente === null);
  return (
    <section>
      <p><Link to="/solicitudes">‹ Volver al listado</Link></p>
      <h1>Solicitud {s.numero_sua}-{s.anio}</h1>
      <div className="fila"><Estado estado={s.estado} /><Prioridad p={s.prioridad} />{s.es_tormenta && <span className="badge off">Tormenta</span>}</div>
      {error && <div className="error" role="alert">{error}</div>}{ok && <div className="ok" role="status">{ok}</div>}
      <div className="card" style={{ marginTop: '.8rem' }}>
        <div><strong>{s.direccion}</strong> · {s.distrito}</div>
        <p>{s.descripcion_reclamo}</p>
        {s.sin_ubicar && <div className="aviso">📍 Esta solicitud no pudo ubicarse en el mapa: el sistema reintenta cada hora. Mientras tanto se puede dictaminar desde el listado, pero no entra en rutas.</div>}
        {s.reservada_por && <div className="aviso">🔒 Reservada en la ruta de {s.reservada_por}.</div>}
        {s.latitud !== null && <Mapa marcadores={[{ lat: s.latitud, lng: s.longitud, etiqueta: '●' }]} alto={200} etiquetaAria="Ubicación de la solicitud" />}
        <h3>Historial de derivaciones</h3>
        <ul>{s.historial.map((h: any) => <li key={h.id_derivacion}>{fechaCorta(h.fecha_derivacion)} — {h.motivo}</li>)}</ul>
      </div>

      {puedeDictaminar && s.estado !== 'Dictaminada' && !hayConflicto && (
        <Link className="btn block" to={`/dictamen/${s.numero_sua}/${s.anio}`}>Dictaminar</Link>
      )}
      {hayConflicto && <div className="aviso">⚖ Hay dos dictámenes firmados para este caso. Un Jefe debe elegir cuál queda vigente.</div>}

      {conflicto.length > 0 && (<>
        <h2>Elegir dictamen vigente</h2>
        <div className="grid2">{conflicto.map((d) => (
          <ResumenDictamen key={d.id_dictamen} d={d} acciones={<button className="btn chico" onClick={() => setElegir(d)}>Dejar este como vigente</button>} />
        ))}</div>
      </>)}

      <h2>Dictámenes del caso</h2>
      {s.estado === 'Pendiente-revisión' && historial.length > 0 && <div className="aviso">Esta solicitud fue re-derivada: abajo podés consultar el dictamen anterior (no se precarga en el formulario nuevo).</div>}
      {!historial.length && <p className="vacio">Todavía no tiene dictámenes.</p>}
      {historial.map((d) => <ResumenDictamen key={d.id_dictamen} d={d} acciones={<button className="btn sec chico" onClick={() => abrirPdf(d.id_dictamen)}>Ver PDF</button>} />)}

      {elegir && (
        <Modal titulo="Confirmar elección" onCerrar={() => setElegir(null)}>
          <p>El dictamen de <strong>{elegir.nombre_usuario}</strong> quedará vigente y el otro pasará al historial como no vigente. Queda registrado quién lo eligió.</p>
          <div className="fila"><button className="btn" onClick={confirmar}>Confirmar</button><button className="btn sec" onClick={() => setElegir(null)}>Cancelar</button></div>
        </Modal>
      )}
    </section>
  );
}
