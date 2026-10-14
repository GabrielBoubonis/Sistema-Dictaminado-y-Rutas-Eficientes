import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError, ErrorRed, api } from '../lib/api';
import { useAuth } from '../auth';
import { cacheGet, db } from '../lib/db';
import { cifrar, descifrar } from '../lib/cifrado';
import { calcularHashFirma } from '../lib/canonical';
import { firmarConHuella, registrarHuella, credencialesDe } from '../lib/biometria';
import { comprimirFoto } from '../lib/imagen';
import { aNumero, CORTE_VERTICAL, vacioFormulario, validarPaso, type FormDictamen } from '../lib/reglas';
import { conCache, marcarFirmadaLocal, type Ruta, type Solicitud } from '../lib/datos';
import { encolar } from '../lib/sync';
import { Mapa } from '../components/Mapa';
import { Modal, textoError } from '../components/ui';
import catalogos from '../catalogos.json';

interface Especie { id_especie: number; nombre_comun: string; nombre_cientifico: string | null }
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const hoy = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const PASOS = ['Ejemplar y ubicación', 'Diagnóstico', 'Intervención', 'Información adicional y fotos', 'Observaciones y firma'];

export function DictamenForm() {
  const { sua, anio } = useParams();
  const { usuario } = useAuth();
  const nav = useNavigate();
  const [sol, setSol] = useState<Solicitud | null>(null);
  const [especies, setEspecies] = useState<Especie[]>([]);
  const [paso, setPaso] = useState(1);
  const [f, setF] = useState<FormDictamen>(vacioFormulario(hoy()));
  const [errores, setErrores] = useState<string[]>([]);
  const [errorGlobal, setErrorGlobal] = useState<string | null>(null);
  const [cargado, setCargado] = useState(false);
  const [bloqueo, setBloqueo] = useState<string | null>(null);
  const [firmando, setFirmando] = useState<'biometria' | 'enviando' | null>(null);
  const [pedirRegistro, setPedirRegistro] = useState(false);
  const claveBorrador = `${usuario!.nombre_usuario}:${sua}-${anio}`;
  const online = navigator.onLine;
  const set = <K extends keyof FormDictamen>(k: K, v: FormDictamen[K]) => setF((p) => ({ ...p, [k]: v }));

  // Carga: solicitud (servidor o, sin señal, la ruta guardada en el captor), catálogo de especies y borrador cifrado
  useEffect(() => {
    (async () => {
      let s: Solicitud | null = null;
      try { s = await api(`/solicitudes/${sua}/${anio}`); }
      catch (e) {
        if (!(e instanceof ErrorRed)) { setBloqueo(textoError(e)); setCargado(true); return; }
        const ruta = await cacheGet<Ruta | null>(`ruta:${usuario!.nombre_usuario}`);
        const it = ruta?.solicitudes.find((x) => x.numero_sua === sua && String(x.anio) === anio);
        if (it) s = { ...it, fecha_ultima_derivacion: '', es_tormenta: false, sin_ubicar: it.latitud === null, reservada_por: usuario!.nombre_usuario } as Solicitud;
      }
      if (!s) { setBloqueo('Sin conexión, solo se pueden dictaminar las solicitudes de la ruta que ya generaste con señal.'); setCargado(true); return; }
      if (s.estado === 'Dictaminada') { setBloqueo('Esta solicitud ya fue dictaminada.'); setCargado(true); return; }
      setSol(s);
      const esp = await conCache<Especie[]>('especies', () => api('/especies'));
      setEspecies(esp.datos ?? []);
      const b = await db.borradores.get(claveBorrador);
      if (b) { try { setF({ ...vacioFormulario(hoy()), ...(await descifrar<FormDictamen>(b.datos as any)) }); } catch { /* borrador ilegible: se descarta */ } }
      else if (s.latitud !== null) setF((p) => ({ ...p, latitud_ejemplar: s!.latitud, longitud_ejemplar: s!.longitud }));
      setCargado(true);
    })();
  }, [sua, anio]); // eslint-disable-line

  // Borrador cifrado: si lo interrumpen no se pierde lo cargado
  const timer = useRef<number>();
  useEffect(() => {
    if (!cargado || !sol) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => { const c = await cifrar(f); await db.borradores.put({ clave: claveBorrador, datos: c, actualizado: Date.now() }); }, 600);
    return () => window.clearTimeout(timer.current);
  }, [f, cargado]); // eslint-disable-line

  const bloqueaAereos = f.es_extraccion || f.es_sin_trabajo;
  const toggleAereo = (t: string) => set('trabajos_aereos', f.trabajos_aereos.includes(t) ? f.trabajos_aereos.filter((x) => x !== t) : [...f.trabajos_aereos, t]);
  const toggleSub = (t: string) => set('trabajos_subterraneos', f.trabajos_subterraneos.some((x) => x.tipo_trabajo === t) ? f.trabajos_subterraneos.filter((x) => x.tipo_trabajo !== t) : [...f.trabajos_subterraneos, { tipo_trabajo: t, distancia_borde: '' }]);
  const marcarExtraccion = (v: boolean) => setF((p) => ({ ...p, es_extraccion: v, ...(v ? { es_sin_trabajo: false, motivo_sin_trabajo: '', trabajos_aereos: [], trabajos_subterraneos: [] } : { perimetro_tronco: '', motivo_extraccion: '' }) }));
  const marcarSinTrabajo = (v: boolean) => setF((p) => ({ ...p, es_sin_trabajo: v, ...(v ? { es_extraccion: false, perimetro_tronco: '', motivo_extraccion: '', trabajos_aereos: [], trabajos_subterraneos: [] } : { motivo_sin_trabajo: '' }) }));

  const siguiente = () => { const e = validarPaso(paso, f); setErrores(e); if (!e.length) { setPaso(paso + 1); window.scrollTo(0, 0); } };
  const anterior = () => { setErrores([]); setPaso(paso - 1); window.scrollTo(0, 0); };

  const agregarFotos = async (archivos: FileList | null) => {
    if (!archivos) return;
    try { const nuevas = await Promise.all([...archivos].map((a) => comprimirFoto(a))); set('fotos', [...f.fotos, ...nuevas].slice(0, 10)); }
    catch { setErrorGlobal('No se pudo procesar una de las fotos.'); }
  };

  const firmar = async () => {
    setErrorGlobal(null);
    const todos = [1, 2, 3, 4, 5].flatMap((p) => validarPaso(p, f));
    if (todos.length) { setErrores(todos); return; }
    if (!(await credencialesDe(usuario!.nombre_usuario)).length) { setPedirRegistro(true); return; }
    const uuid = f.uuid_dictamen || crypto.randomUUID();
    if (!f.uuid_dictamen) set('uuid_dictamen', uuid);
    const payload: Record<string, any> = {
      uuid_dictamen: uuid, fecha_firma: new Date().toISOString(), numero_sua: sol!.numero_sua, anio: sol!.anio,
      nota_numero: aNumero(f.nota_numero), expediente_numero: aNumero(f.expediente_numero), fecha_emision: f.fecha_emision,
      domicilio_ejemplar: sol!.direccion, latitud_ejemplar: f.latitud_ejemplar, longitud_ejemplar: f.longitud_ejemplar,
      referencia_ubicacion: f.referencia_ubicacion.trim() || null,
      id_especie: f.id_especie, distancia_medianera_referencia: aNumero(f.distancia_medianera_referencia),
      cantidad_frente: f.cantidad_frente ? Number(f.cantidad_frente) : null, nivel_dano_vereda: f.nivel_dano_vereda || null,
      es_extraccion: f.es_extraccion, perimetro_tronco: f.es_extraccion ? aNumero(f.perimetro_tronco) : null, motivo_extraccion: f.es_extraccion ? f.motivo_extraccion : null,
      es_sin_trabajo: f.es_sin_trabajo, motivo_sin_trabajo: f.es_sin_trabajo ? f.motivo_sin_trabajo : null,
      trabajos_aereos: f.trabajos_aereos, trabajos_subterraneos: f.trabajos_subterraneos.map((t) => ({ tipo_trabajo: t.tipo_trabajo, distancia_borde: t.tipo_trabajo === CORTE_VERTICAL ? aNumero(t.distancia_borde) : null })),
      complejidad: f.complejidad, urgente: f.urgente, arbol_frente_garage: f.arbol_frente_garage, media_tension: f.media_tension, de_oficio: f.de_oficio,
      plantar: f.plantar && f.plantar !== 'ninguna' ? f.plantar : null, nivel_prioridad: f.nivel_prioridad, observaciones: f.observaciones.trim() || null,
      firmado_sin_conexion: !navigator.onLine,
    };
    setFirmando('biometria');
    let segundo_factor: unknown, hash: string;
    try {
      hash = await calcularHashFirma({ ...payload, nombre_usuario: usuario!.nombre_usuario }, f.fotos);
      segundo_factor = await firmarConHuella(usuario!.nombre_usuario, hash);
    } catch (e: any) {
      setFirmando(null);
      setErrorGlobal(e?.message === 'SIN_CREDENCIAL' ? 'Primero tenés que registrar tu huella en este captor.' : 'La verificación biométrica falló o se canceló. Tus datos siguen cargados: probá de nuevo.');
      return;
    }
    const dictamen = { ...payload, hash_firma: hash, fotos: f.fotos.map((b) => ({ contenido_base64: b })) };
    setFirmando('enviando');
    try {
      const r = await api('/dictamenes', { body: { ...dictamen, segundo_factor } });
      await db.borradores.delete(claveBorrador);
      nav('/ruta', { replace: true, state: { mensaje: `Dictamen firmado${r.enviado_sua ? ' y enviado al SUA' : ' (el envío al SUA se reintenta solo)'}.` } });
    } catch (e) {
      if (e instanceof ErrorRed) { // RF-31/RF-32: sin señal, queda firmado y cifrado en el captor
        try {
          await encolar(usuario!.nombre_usuario, { dictamen, segundo_factor });
          await marcarFirmadaLocal(sol!.numero_sua, sol!.anio);
          await db.borradores.delete(claveBorrador);
          nav('/ruta', { replace: true, state: { mensaje: 'Sin señal: el dictamen quedó firmado y guardado en el captor. Se enviará solo cuando haya conexión.' } });
        } catch { setErrorGlobal('No se pudo guardar el dictamen en el captor (almacenamiento lleno o bloqueado). No se perdieron los datos del formulario.'); }
      } else if (e instanceof ApiError && e.body?.detalles) {
        setErrorGlobal(`El servidor rechazó el dictamen: ${e.body.detalles.map((d: any) => d.mensaje ?? d.campo).join('; ')}`);
      } else setErrorGlobal(textoError(e));
    } finally { setFirmando(null); }
  };

  if (!cargado) return <p role="status">Cargando…</p>;
  if (bloqueo || !sol) return <div><div className="aviso" role="alert">{bloqueo}</div><Link to="/solicitudes">‹ Volver</Link></div>;

  const especie = especies.find((e) => e.id_especie === f.id_especie);
  return (
    <section>
      <p><Link to={`/solicitudes/${sol.numero_sua}/${sol.anio}`}>‹ Cancelar</Link></p>
      <h1>Dictamen · {sol.numero_sua}-{sol.anio}</h1>
      <div className="pasos" aria-hidden>{PASOS.map((_, i) => <span key={i} className={i + 1 < paso ? 'hecho' : i + 1 === paso ? 'actual' : ''} />)}</div>
      <h2 style={{ marginTop: 0 }} role="status">Paso {paso} de 5 · {PASOS[paso - 1]}</h2>
      {!online && <div className="aviso">SIN SEÑAL: al firmar, el dictamen se guarda cifrado en este captor y se envía solo cuando vuelva la conexión.</div>}
      {errores.length > 0 && <div className="error" role="alert"><ul style={{ margin: 0, paddingLeft: '1.1rem' }}>{errores.map((e) => <li key={e}>{e}</li>)}</ul></div>}
      {errorGlobal && <div className="error" role="alert">{errorGlobal}</div>}

      {paso === 1 && (<>
        <div className="grid2">
          <div><label>Distrito</label><input type="text" value={sol.distrito} disabled /></div>
          <div><label>SUA N.°</label><input type="text" value={`${sol.numero_sua}-${sol.anio}`} disabled /></div>
          <div><label htmlFor="nota">Nota N.°</label><input id="nota" type="text" inputMode="numeric" value={f.nota_numero} onChange={(e) => set('nota_numero', e.target.value)} /></div>
          <div><label htmlFor="exp">Expediente N.°</label><input id="exp" type="text" inputMode="numeric" value={f.expediente_numero} onChange={(e) => set('expediente_numero', e.target.value)} /></div>
          <div><label htmlFor="fecha">Fecha</label><input id="fecha" type="date" value={f.fecha_emision} onChange={(e) => set('fecha_emision', e.target.value)} /></div>
        </div>
        <label>Domicilio de la solicitud</label><input type="text" value={sol.direccion} disabled />
        <label>Domicilio del ejemplar * <span className="ayuda">tocá el mapa en el punto exacto</span></label>
        <Mapa punto={f.latitud_ejemplar !== null ? { lat: f.latitud_ejemplar, lng: f.longitud_ejemplar! } : null} onPunto={(p) => { set('latitud_ejemplar', p.lat); set('longitud_ejemplar', p.lng); }} etiquetaAria="Mapa para marcar la ubicación del ejemplar" />
        <label htmlFor="ref">Referencia de ubicación</label><input id="ref" type="text" maxLength={300} value={f.referencia_ubicacion} onChange={(e) => set('referencia_ubicacion', e.target.value)} />
        <SelectorEspecie especies={especies} valor={especie} onElegir={(e) => set('id_especie', e.id_especie)} onNueva={(e) => { setEspecies([...especies, e]); set('id_especie', e.id_especie); }} online={online} />
        <div className="grid2">
          <div><label htmlFor="med">Distancia a medianera/referencia (m)</label><input id="med" type="text" inputMode="decimal" value={f.distancia_medianera_referencia} onChange={(e) => set('distancia_medianera_referencia', e.target.value)} /></div>
          <div><label htmlFor="cf">Cantidad de ejemplares al frente</label><input id="cf" type="text" inputMode="numeric" value={f.cantidad_frente} onChange={(e) => set('cantidad_frente', e.target.value.replace(/\D/g, ''))} /></div>
        </div>
      </>)}

      {paso === 2 && (<>
        <h3>Nivel de daño en vereda</h3>
        <div className="toggle" role="group" aria-label="Nivel de daño en vereda">{catalogos.nivel_dano_vereda.map((n) => (
          <button type="button" key={n} className={f.nivel_dano_vereda === n ? 'activo' : ''} aria-pressed={f.nivel_dano_vereda === n} onClick={() => set('nivel_dano_vereda', f.nivel_dano_vereda === n ? '' : n)}>{n}</button>))}</div>
        <h3>Extracción</h3>
        <label className={`check ${f.es_sin_trabajo ? 'off' : ''}`}><input type="checkbox" checked={f.es_extraccion} disabled={f.es_sin_trabajo} onChange={(e) => marcarExtraccion(e.target.checked)} />Extracción</label>
        {f.es_extraccion && (<>
          <label htmlFor="per">Perímetro del tronco (m)</label><input id="per" type="text" inputMode="decimal" value={f.perimetro_tronco} onChange={(e) => set('perimetro_tronco', e.target.value)} />
          <label htmlFor="mot">Motivo de la extracción *</label>
          <select id="mot" value={f.motivo_extraccion} onChange={(e) => set('motivo_extraccion', e.target.value)}><option value="">Elegí un motivo</option>{catalogos.motivo_extraccion.map((m) => <option key={m}>{m}</option>)}</select>
        </>)}
        <h3>Sin trabajo</h3>
        <label className={`check ${f.es_extraccion ? 'off' : ''}`}><input type="checkbox" checked={f.es_sin_trabajo} disabled={f.es_extraccion} onChange={(e) => marcarSinTrabajo(e.target.checked)} />Sin trabajo</label>
        {f.es_sin_trabajo && (<>
          <label htmlFor="mst">Motivo *</label>
          <select id="mst" value={f.motivo_sin_trabajo} onChange={(e) => set('motivo_sin_trabajo', e.target.value)}><option value="">Elegí un motivo</option>{catalogos.motivo_sin_trabajo.map((m) => <option key={m}>{m}</option>)}</select>
        </>)}
        <p className="ayuda">“Sin trabajo” y “Extracción” son excluyentes entre sí y con los trabajos aéreos y subterráneos.</p>
      </>)}

      {paso === 3 && (<>
        {f.es_extraccion && <div className="error" role="status">Extracción marcada en el paso 2: los trabajos aéreos y subterráneos están deshabilitados.</div>}
        {f.es_sin_trabajo && <div className="aviso" role="status">“Sin trabajo” marcado en el paso 2: no se cargan trabajos.</div>}
        <h3>Trabajos subterráneos</h3>
        {catalogos.trabajos_subterraneos.map((t) => {
          const sel = f.trabajos_subterraneos.find((x) => x.tipo_trabajo === t);
          return (<div key={t}>
            <label className={`check ${bloqueaAereos ? 'off' : ''}`}><input type="checkbox" disabled={bloqueaAereos} checked={!!sel} onChange={() => toggleSub(t)} />{t}</label>
            {sel && t === CORTE_VERTICAL && (<div style={{ marginLeft: '2rem' }}><label htmlFor="dist">Distancia al borde del árbol (m) *</label>
              <input id="dist" type="text" inputMode="decimal" value={sel.distancia_borde} onChange={(e) => set('trabajos_subterraneos', f.trabajos_subterraneos.map((x) => x === sel ? { ...x, distancia_borde: e.target.value } : x))} /></div>)}
          </div>);
        })}
        <h3>Trabajos aéreos</h3>
        {catalogos.trabajos_aereos.map((t) => (
          <label key={t} className={`check ${bloqueaAereos ? 'off' : ''}`}><input type="checkbox" disabled={bloqueaAereos} checked={f.trabajos_aereos.includes(t)} onChange={() => toggleAereo(t)} />{t}</label>
        ))}
      </>)}

      {paso === 4 && (<>
        <label htmlFor="cx">Complejidad de la intervención *</label>
        <select id="cx" value={f.complejidad} onChange={(e) => set('complejidad', e.target.value)}><option value="">Elegí una opción</option>{catalogos.complejidad.map((c) => <option key={c}>{c}</option>)}</select>
        <div className="grid2" style={{ marginTop: '.5rem' }}>
          {([['urgente', 'Urgente'], ['arbol_frente_garage', 'Árbol frente a garage'], ['media_tension', 'Media tensión'], ['de_oficio', 'De oficio']] as const).map(([k, t]) => (
            <label key={k} className="check"><input type="checkbox" checked={f[k]} onChange={(e) => set(k, e.target.checked)} />{t}</label>))}
        </div>
        <label htmlFor="pl">Plantar (árbol nuevo)</label>
        <select id="pl" value={f.plantar} onChange={(e) => set('plantar', e.target.value)}><option value="">Ninguna</option>{catalogos.plantar.filter((p) => p !== 'ninguna').map((p) => <option key={p}>{p}</option>)}</select>
        <label>Fotografías del ejemplar * <span className="ayuda">(mínimo 1, máximo 10)</span></label>
        <input type="file" accept="image/*" capture="environment" multiple aria-label="Agregar fotografías" onChange={(e) => { void agregarFotos(e.target.files); e.target.value = ''; }} />
        <div className="fotos" style={{ marginTop: '.6rem' }}>{f.fotos.map((b, i) => (
          <div className="foto" key={i}><img alt={`Fotografía ${i + 1}`} src={`data:image/jpeg;base64,${b}`} /><button type="button" aria-label={`Quitar fotografía ${i + 1}`} onClick={() => set('fotos', f.fotos.filter((_, j) => j !== i))}>×</button></div>))}</div>
      </>)}

      {paso === 5 && (<>
        <label htmlFor="pr">Nivel de prioridad de la intervención *</label>
        <select id="pr" value={f.nivel_prioridad} onChange={(e) => set('nivel_prioridad', e.target.value)}><option value="">Elegí una opción</option>{catalogos.nivel_prioridad.map((c) => <option key={c}>{c}</option>)}</select>
        <label htmlFor="obs">Observaciones</label>
        <textarea id="obs" rows={4} maxLength={1000} value={f.observaciones} onChange={(e) => set('observaciones', e.target.value)} />
        <h3>Resumen</h3>
        <div className="card">
          <div>Especie: <strong>{especie?.nombre_comun ?? '—'}</strong> · Daño en vereda: {f.nivel_dano_vereda || '—'} · Complejidad: {f.complejidad || '—'}</div>
          <div>Intervención: {f.es_extraccion ? `Extracción (${f.motivo_extraccion})` : f.es_sin_trabajo ? `Sin trabajo (${f.motivo_sin_trabajo})` : [...f.trabajos_aereos, ...f.trabajos_subterraneos.map((t) => t.tipo_trabajo)].join('; ') || '—'}</div>
          <div>Fotografías: {f.fotos.length}</div>
        </div>
        <p className="ayuda">Al firmar se te va a pedir tu huella o reconocimiento facial. Una vez firmado, el dictamen no se puede modificar.</p>
        <button className="btn block" onClick={firmar} disabled={!!firmando}>✍ Firmar dictamen</button>
      </>)}

      <div className="fila sb" style={{ marginTop: '1rem' }}>
        <button className="btn sec" onClick={anterior} disabled={paso === 1 || !!firmando}>‹ Anterior</button>
        {paso < 5 && <button className="btn" onClick={siguiente}>Siguiente ›</button>}
      </div>

      {firmando === 'biometria' && <Modal titulo="Verificación biométrica"><p role="status">Confirmá con tu huella o reconocimiento facial para firmar el dictamen.</p></Modal>}
      {firmando === 'enviando' && <Modal titulo="Firmando"><p role="status">{online ? 'Enviando el dictamen…' : 'Guardando el dictamen en el captor…'}</p></Modal>}
      {pedirRegistro && (
        <Modal titulo="Registrá tu huella" onCerrar={() => setPedirRegistro(false)}>
          <p>Para firmar dictámenes necesitás registrar la verificación biométrica de este captor (una sola vez).</p>
          {!online && <div className="error">Necesitás conexión para registrarla.</div>}
          <div className="fila"><button className="btn" disabled={!online} onClick={async () => { try { await registrarHuella(usuario!.nombre_usuario); setPedirRegistro(false); setErrorGlobal(null); } catch (e) { setPedirRegistro(false); setErrorGlobal('No se pudo registrar la huella: ' + textoError(e)); } }}>Registrar ahora</button>
            <button className="btn sec" onClick={() => setPedirRegistro(false)}>Cancelar</button></div>
        </Modal>
      )}
    </section>
  );
}

function SelectorEspecie({ especies, valor, onElegir, onNueva, online }: { especies: Especie[]; valor?: Especie; onElegir: (e: Especie) => void; onNueva: (e: Especie) => void; online: boolean }) {
  const [q, setQ] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const coincidencias = useMemo(() => (q ? especies.filter((e) => norm(e.nombre_comun + ' ' + (e.nombre_cientifico ?? '')).includes(norm(q))).slice(0, 8) : []), [q, especies]);
  const agregar = async () => {
    setError(null);
    try { const e = await api('/especies', { body: { nombre_comun: q } }); onNueva(e); setQ(''); setAbierto(false); } catch (err) { setError(textoError(err)); }
  };
  return (
    <div>
      <label htmlFor="esp">Especie *</label>
      {valor && !abierto ? (
        <div className="fila"><strong>{valor.nombre_comun}</strong>{valor.nombre_cientifico && <em className="ayuda">{valor.nombre_cientifico}</em>}<button type="button" className="btn sec chico" onClick={() => setAbierto(true)}>Cambiar</button></div>
      ) : (<>
        <input id="esp" type="text" autoComplete="off" placeholder="Escribí para buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
        {q.length > 0 && (
          <div className="sugerencias" role="listbox" aria-label="Especies">
            {coincidencias.map((e) => <button type="button" role="option" aria-selected={false} key={e.id_especie} onClick={() => { onElegir(e); setQ(''); setAbierto(false); }}>{e.nombre_comun} {e.nombre_cientifico && <em className="ayuda">({e.nombre_cientifico})</em>}</button>)}
            {!coincidencias.some((e) => norm(e.nombre_comun) === norm(q)) && (online
              ? <button type="button" onClick={agregar}>➕ Agregar especie “{q}”</button>
              : <div className="ayuda" style={{ padding: '.6rem' }}>Para agregar una especie nueva necesitás conexión.</div>)}
          </div>
        )}
        {error && <div className="error" role="alert">{error}</div>}
      </>)}
    </div>
  );
}
