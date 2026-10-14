import { useState } from 'react';
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
        <p>Un Administrador revocó el acceso de este captor y se borraron los datos locales. Si es un error, contactá a tu Administrador.</p>
      </div></div>
    );
  }

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault(); setEnviando(true); setError(null);
    const msg = await login(usuario.trim(), password);
    if (msg) { setError(msg); setPassword(''); }
    setEnviando(false);
  };
  return (
    <div className="centro">
      <form className="card" onSubmit={enviar} aria-labelledby="titulo-login">
        <div style={{ textAlign: 'center', fontSize: '2.5rem' }} aria-hidden>🌳</div>
        <h1 id="titulo-login" style={{ textAlign: 'center' }}>Dictaminado y Rutas Eficientes</h1>
        <p className="ayuda" style={{ textAlign: 'center' }}>Dirección General de Parques y Paseos · Municipalidad de Rosario</p>
        {aviso && <div className="aviso" role="status">{aviso}</div>}
        {!online && <div className="aviso" role="status">Sin señal: podés reanudar tu sesión si ingresaste con conexión hoy.</div>}
        <label htmlFor="usuario">Usuario</label>
        <input id="usuario" type="text" autoComplete="username" autoCapitalize="none" value={usuario} onChange={(e) => setUsuario(e.target.value)} required />
        <label htmlFor="password">Contraseña</label>
        <div className="fila" style={{ flexWrap: 'nowrap' }}>
          <input id="password" type={ver ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <button type="button" className="btn sec" onClick={() => setVer(!ver)} aria-label={ver ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={ver}>{ver ? '🙈' : '👁'}</button>
        </div>
        {error && <div className="error" role="alert">{error}</div>}
        <button className="btn block" style={{ marginTop: '1rem' }} disabled={!usuario || !password || enviando}>{enviando ? 'Ingresando…' : online ? 'Ingresar' : 'Reanudar sin señal'}</button>
      </form>
    </div>
  );
}
