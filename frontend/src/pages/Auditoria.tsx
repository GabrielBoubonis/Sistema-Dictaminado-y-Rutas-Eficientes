import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Paginacion, fechaHora, textoError } from '../components/ui';

interface Ev { id_auditoria: number; nombre_usuario: string; accion: string; entidad_afectada: string; valor_anterior: string | null; valor_nuevo: string | null; fecha_hora: string }

export function Auditoria() {
  const [f, setF] = useState({ usuario: '', accion: '', desde: '', hasta: '' });
  const [pagina, setPagina] = useState(1);
  const [d, setD] = useState<{ total: number; items: Ev[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const q = new URLSearchParams({ limite: '30', pagina: String(pagina) });
    (Object.entries(f) as [string, string][]).forEach(([k, v]) => v && q.set(k, v));
    setError(null);
    api(`/auditoria?${q}`).then(setD).catch((e) => setError(textoError(e)));
  }, [f, pagina]);
  const cambiar = (k: keyof typeof f, v: string) => { setF({ ...f, [k]: v }); setPagina(1); };
  return (
    <section>
      <h1>Auditoría</h1>
      <p className="ayuda">Registro inmutable de altas, bajas y cambios de rol, y de desbloqueos y revocaciones de captores. Solo consulta.</p>
      <div className="grid2">
        <div><label htmlFor="u">Usuario</label><input id="u" type="text" value={f.usuario} onChange={(e) => cambiar('usuario', e.target.value)} /></div>
        <div><label htmlFor="ac">Acción</label><input id="ac" type="text" placeholder="Ej.: desbloqueo" value={f.accion} onChange={(e) => cambiar('accion', e.target.value)} /></div>
        <div><label htmlFor="de">Desde</label><input id="de" type="date" value={f.desde} onChange={(e) => cambiar('desde', e.target.value)} /></div>
        <div><label htmlFor="ha">Hasta</label><input id="ha" type="date" value={f.hasta} onChange={(e) => cambiar('hasta', e.target.value)} /></div>
      </div>
      {error && <div className="error" role="alert">{error}</div>}
      {d && (<>
        <Paginacion total={d.total} pagina={pagina} porPagina={30} onPagina={setPagina} />
        <div className="scroll-x"><table className="tabla"><thead><tr><th>Fecha y hora</th><th>Realizó</th><th>Acción</th><th>Afectado</th><th>Antes</th><th>Después</th></tr></thead>
          <tbody>{d.items.map((e) => <tr key={e.id_auditoria}><td>{fechaHora(e.fecha_hora)}</td><td>{e.nombre_usuario}</td><td>{e.accion}</td><td>{e.entidad_afectada}</td><td>{e.valor_anterior ?? '—'}</td><td>{e.valor_nuevo ?? '—'}</td></tr>)}</tbody></table></div>
        {!d.items.length && <p className="vacio">Sin eventos con esos filtros.</p>}
      </>)}
    </section>
  );
}
