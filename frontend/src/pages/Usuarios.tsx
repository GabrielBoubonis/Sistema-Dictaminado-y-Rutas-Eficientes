import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../auth';
import { Modal, fechaCorta, textoError } from '../components/ui';

interface U { nombre_usuario: string; nombre_completo: string; rol: string; activo: boolean; fecha_alta: string }
interface Captor { codigo: string; usuario: string | null; estado: string; fecha_bloqueo: string | null }
const ROLES = ['Lector', 'Operador', 'Jefe', 'Administrador'];

export function Usuarios() {
  const { usuario } = useAuth();
  const [us, setUs] = useState<U[]>([]);
  const [captores, setCaptores] = useState<Captor[]>([]);
  const [codigo, setCodigo] = useState('');
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [nuevo, setNuevo] = useState(false);
  const [form, setForm] = useState({ nombre: '', apellido: '', password: '', rol: 'Operador' });
  const [pass, setPass] = useState<{ usuario: string; valor?: string } | null>(null);

  const cargar = async () => {
    try { setUs(await api('/usuarios')); setCaptores(await api(`/usuarios/captores-bloqueados${codigo ? `?codigo=${encodeURIComponent(codigo)}` : ''}`)); }
    catch (e) { setMsg({ tipo: 'error', texto: textoError(e) }); }
  };
  useEffect(() => { void cargar(); }, [codigo]); // eslint-disable-line
  const accion = async (f: () => Promise<unknown>, ok: string) => { try { await f(); setMsg({ tipo: 'ok', texto: ok }); await cargar(); } catch (e) { setMsg({ tipo: 'error', texto: textoError(e) }); } };

  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    await accion(async () => { const u = await api('/usuarios', { body: form }); setNuevo(false); setForm({ nombre: '', apellido: '', password: '', rol: 'Operador' }); setMsg({ tipo: 'ok', texto: `Usuario creado: ${u.nombre_usuario}` }); }, `Usuario creado.`);
  };

  return (
    <section>
      <h1>Gestión de usuarios</h1>
      {msg && <div className={msg.tipo === 'ok' ? 'ok' : 'error'} role={msg.tipo === 'ok' ? 'status' : 'alert'}>{msg.texto}</div>}

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Captores bloqueados</h2>
        <label htmlFor="cod">Código que figura en la pantalla del captor</label>
        <input id="cod" type="text" placeholder="XXXX-XXXX" value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} />
        {!captores.length && <p className="ayuda">No hay captores bloqueados con ese código.</p>}
        {captores.map((c) => (
          <div key={c.codigo} className="fila sb" style={{ padding: '.5rem 0', borderTop: '1px solid #eee' }}>
            <span><strong>{c.codigo}</strong> · {c.usuario ?? 'sin usuario'} · <span className="badge warn">{c.estado}</span></span>
            {c.estado === 'Bloqueado' && <button className="btn chico" onClick={() => accion(() => api(`/usuarios/captores/${c.codigo}/desbloquear`, { body: {} }), `Captor ${c.codigo} desbloqueado.`)}>Desbloquear</button>}
          </div>
        ))}
      </div>

      <div className="fila sb"><h2>Usuarios</h2><button className="btn chico" onClick={() => setNuevo(true)}>+ Nuevo usuario</button></div>
      <div className="scroll-x"><table className="tabla">
        <thead><tr><th>Usuario</th><th>Nombre</th><th>Rol</th><th>Estado</th><th>Alta</th><th>Acciones</th></tr></thead>
        <tbody>{us.map((u) => (
          <tr key={u.nombre_usuario}>
            <td>{u.nombre_usuario}</td><td>{u.nombre_completo}</td>
            <td><select aria-label={`Rol de ${u.nombre_usuario}`} value={u.rol} disabled={u.nombre_usuario === usuario?.nombre_usuario}
              onChange={(e) => accion(() => api(`/usuarios/${u.nombre_usuario}`, { method: 'PATCH', body: { rol: e.target.value } }), `Rol de ${u.nombre_usuario} actualizado.`)}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select></td>
            <td>{u.activo ? <span className="badge">Activo</span> : <span className="badge off">Baja</span>}</td>
            <td>{fechaCorta(u.fecha_alta)}</td>
            <td className="fila">
              <button className="btn sec chico" onClick={() => setPass({ usuario: u.nombre_usuario })}>Restablecer contraseña</button>
              {u.nombre_usuario !== usuario?.nombre_usuario && <button className="btn sec chico" onClick={() => accion(() => api(`/usuarios/${u.nombre_usuario}`, { method: 'PATCH', body: { activo: !u.activo } }), u.activo ? `${u.nombre_usuario} dado de baja.` : `${u.nombre_usuario} reactivado.`)}>{u.activo ? 'Dar de baja' : 'Reactivar'}</button>}
              <button className="btn sec chico" onClick={() => accion(() => api(`/usuarios/${u.nombre_usuario}/revocar-captor`, { body: {} }), `Captor de ${u.nombre_usuario} revocado.`)}>Revocar captor</button>
            </td>
          </tr>))}</tbody></table></div>

      {nuevo && (
        <Modal titulo="Nuevo usuario" onCerrar={() => setNuevo(false)}>
          <form onSubmit={crear}>
            <label htmlFor="n">Nombre</label><input id="n" type="text" required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            <label htmlFor="a">Apellido</label><input id="a" type="text" required value={form.apellido} onChange={(e) => setForm({ ...form, apellido: e.target.value })} />
            <label htmlFor="r">Rol</label><select id="r" value={form.rol} onChange={(e) => setForm({ ...form, rol: e.target.value })}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select>
            <label htmlFor="p">Contraseña inicial</label><input id="p" type="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            <p className="ayuda">Mínimo 8 caracteres con mayúscula, minúscula, número y carácter especial. El nombre de usuario se genera solo.</p>
            <div className="fila"><button className="btn">Crear</button><button type="button" className="btn sec" onClick={() => setNuevo(false)}>Cancelar</button></div>
          </form>
        </Modal>
      )}
      {pass && (
        <Modal titulo={`Restablecer contraseña de ${pass.usuario}`} onCerrar={() => setPass(null)}>
          {pass.valor ? <><p>Contraseña nueva (anotala, no se vuelve a mostrar):</p><div className="codigo" style={{ fontSize: '1.1rem' }}>{pass.valor}</div><button className="btn" onClick={() => setPass(null)}>Listo</button></>
            : <><p>Se genera una contraseña nueva y la anterior deja de funcionar.</p><div className="fila"><button className="btn" onClick={async () => { try { const r = await api(`/usuarios/${pass.usuario}/reset-password`, { body: {} }); setPass({ usuario: pass.usuario, valor: r.passwordNueva }); } catch (e) { setMsg({ tipo: 'error', texto: textoError(e) }); setPass(null); } }}>Generar</button><button className="btn sec" onClick={() => setPass(null)}>Cancelar</button></div></>}
        </Modal>
      )}
    </section>
  );
}
