import { useState } from 'react';
import { Check, Copy, Eye, EyeOff, LogIn, TreeDeciduous } from 'lucide-react';
import { CLAVE_DEMO, MOSTRAR_DEMO, USUARIOS_DEMO } from '../lib/demo';
import { useAuth } from '../auth';
import { useSync } from '../lib/sync';

export function Login() {
  const { fase, codigo, aviso, login } = useAuth();
  const { online } = useSync();
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [ver, setVer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (fase === 'bloqueado') {
    return (
      <div className="centro"><div className="card" role="alert">
        <h1>Captor bloqueado</h1>
        <p>Se superó el máximo de intentos de ingreso. Para desbloquearlo, pasale este código a un Administrador:</p>
        <div className="codigo" aria-label={`Código del captor ${codigo}`}>{codigo}</div>
        <p className="ayuda">Esta pantalla se actualiza sola cuando el Administrador lo desbloquea (necesita señal).</p>
      </div></div>
    );
  }
  if (fase === 'revocado') {
    return (
      <div className="centro"><div className="card" role="alert">
        <h1>Sesión finalizada</h1>
        <p>Un Administrador revocó el acceso de este captor y se borraron los datos locales.</p>
        {codigo && <><p>Si el celular se recuperó, un Administrador puede volver a ponerlo en circulación con este código:</p>
          <div className="codigo" aria-label={`Código del captor ${codigo}`}>{codigo}</div>
          <p className="ayuda">Esta pantalla se actualiza sola cuando lo vuelvan a habilitar (necesita señal).</p></>}
      </div></div>
    );
  }

  const usarDemo = (u: string) => { setUsuario(u); setPassword(CLAVE_DEMO); setError(null); document.getElementById('password')?.focus(); };
  const enviar = async (e: React.FormEvent) => {
    e.preventDefault(); setEnviando(true); setError(null);
    const msg = await login(usuario.trim(), password);
    if (msg) { setError(msg); setPassword(''); }
    setEnviando(false);
  };
  return (
    <div className="centro" style={{ flexDirection: 'column', gap: 'var(--space-4)' }}>
      <form className="card" onSubmit={enviar} aria-labelledby="titulo-login">
        <div className="marca-login">
          <span className="sello"><TreeDeciduous className="ico" aria-hidden /></span>
          <h1 id="titulo-login" style={{ margin: 0 }}>Dictaminado y Rutas Eficientes</h1>
          <p className="ayuda" style={{ margin: 0 }}>Dirección General de Parques y Paseos · Municipalidad de Rosario</p>
        </div>
        {aviso && <div className="aviso" role="status">{aviso}</div>}
        {!online && <div className="aviso" role="status">Sin señal: podés reanudar tu sesión si ingresaste con conexión hoy.</div>}
        <label htmlFor="usuario">Usuario</label>
        <input id="usuario" type="text" autoComplete="username" autoCapitalize="none" value={usuario} onChange={(e) => setUsuario(e.target.value)} required />
        <label htmlFor="password">Contraseña</label>
        <div className="fila" style={{ flexWrap: 'nowrap' }}>
          <input id="password" type={ver ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <button type="button" className="btn sec" onClick={() => setVer(!ver)} aria-label={ver ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={ver}>{ver ? <EyeOff className="ico" aria-hidden /> : <Eye className="ico" aria-hidden />}</button>
        </div>
        {error && <div className="error" role="alert">{error}</div>}
        <button className="btn block" style={{ marginTop: '1rem' }} disabled={!usuario || !password || enviando}>{enviando ? 'Ingresando…' : online ? 'Ingresar' : 'Reanudar sin señal'}</button>
      </form>
      {MOSTRAR_DEMO && <DemoUsuarios onUsar={usarDemo} />}
    </div>
  );
}

/** Usuarios de la demo: tocar uno completa usuario y contraseña; también se pueden copiar. */
function DemoUsuarios({ onUsar }: { onUsar: (u: string) => void }) {
  const [copiado, setCopiado] = useState<string | null>(null);
  const copiar = async (texto: string) => {
    try { await navigator.clipboard.writeText(texto); setCopiado(texto); setTimeout(() => setCopiado(null), 1500); } catch { /* sin portapapeles: queda el botón Usar */ }
  };
  return (
    <section className="card demo" aria-labelledby="titulo-demo">
      <h2 id="titulo-demo" style={{ marginTop: 0 }}>Usuarios de demostración</h2>
      <p className="ayuda" style={{ marginTop: 0 }}>Tocá <b>Usar</b> en un usuario y después <b>Ingresar</b>. La contraseña es la misma para todos:</p>
      <div className="fila sb demo-clave">
        <code>{CLAVE_DEMO}</code>
        <button type="button" className="btn sec chico" onClick={() => copiar(CLAVE_DEMO)} aria-label="Copiar la contraseña">
          {copiado === CLAVE_DEMO ? <><Check className="ico" aria-hidden /> Copiada</> : <><Copy className="ico" aria-hidden /> Copiar</>}
        </button>
      </div>
      <ul className="demo-lista">
        {USUARIOS_DEMO.map((d) => (
          <li key={d.usuario}>
            <div className="demo-dato">
              <span className="fila" style={{ gap: 'var(--space-2)' }}><code>{d.usuario}</code><span className="badge info">{d.rol}</span></span>
              <span className="ayuda">{d.para}</span>
            </div>
            <span className="fila" style={{ gap: 'var(--space-2)', flexWrap: 'nowrap' }}>
              <button type="button" className="btn sec chico" onClick={() => copiar(d.usuario)} aria-label={`Copiar el usuario ${d.usuario}`}>
                {copiado === d.usuario ? <Check className="ico" aria-hidden /> : <Copy className="ico" aria-hidden />}
              </button>
              <button type="button" className="btn chico" onClick={() => onUsar(d.usuario)} aria-label={`Usar el usuario ${d.usuario} (${d.rol})`}><LogIn className="ico" aria-hidden /> Usar</button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
