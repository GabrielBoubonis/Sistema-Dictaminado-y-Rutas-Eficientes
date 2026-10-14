import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth, type Rol } from './auth';
import { useSync } from './lib/sync';
import { api } from './lib/api';
import { Login } from './pages/Login';
import { Solicitudes } from './pages/Solicitudes';
import { SolicitudDetalle } from './pages/SolicitudDetalle';
import { MiRuta } from './pages/MiRuta';
import { DictamenForm } from './pages/DictamenForm';
import { Tormenta } from './pages/Tormenta';
import { Dashboard } from './pages/Dashboard';
import { Usuarios } from './pages/Usuarios';
import { Auditoria } from './pages/Auditoria';
import { Revision } from './pages/Revision';
import { Pendientes } from './pages/Pendientes';

function Sincronizacion() {
  const s = useSync();
  if (!s.online) return <span className="badge off" role="status">SIN SEÑAL{s.pendientes ? ` · ${s.pendientes} pendiente${s.pendientes > 1 ? 's' : ''}` : ''}</span>;
  if (s.sincronizando) return <span className="badge info" role="status">Sincronizando…</span>;
  if (s.pendientes) return <span className="badge warn" role="status">{s.pendientes} por sincronizar</span>;
  return <span className="badge" role="status">✓ Todo sincronizado</span>;
}

const NAV: Array<{ a: string; t: string; roles: Rol[] }> = [
  { a: '/solicitudes', t: 'Solicitudes', roles: ['Operador', 'Jefe'] },
  { a: '/ruta', t: 'Mi ruta', roles: ['Operador', 'Jefe'] },
  { a: '/tormenta', t: 'Tormenta', roles: ['Operador', 'Jefe', 'Administrador', 'Lector'] },
  { a: '/dashboard', t: 'Dashboard', roles: ['Jefe', 'Administrador', 'Lector'] },
  { a: '/usuarios', t: 'Usuarios', roles: ['Administrador'] },
  { a: '/auditoria', t: 'Auditoría', roles: ['Administrador'] },
  { a: '/revision', t: 'Para revisar', roles: ['Administrador'] },
];

export function App() {
  const { fase, usuario, sinConexion, logout } = useAuth();
  const sync = useSync();
  const [hayTormenta, setHayTormenta] = useState(false);

  useEffect(() => {
    if (fase !== 'autenticado' || sinConexion) return;
    api('/tormenta').then((r) => setHayTormenta(r.hay_pendientes)).catch(() => {});
  }, [fase, sinConexion, sync.online]);

  if (fase === 'cargando') return <div className="centro" role="status">Cargando…</div>;
  if (fase !== 'autenticado' || !usuario) return <Login />;

  const rol = usuario.rol;
  const inicio = ['Operador', 'Jefe'].includes(rol) ? '/solicitudes' : rol === 'Administrador' ? '/usuarios' : '/dashboard';
  const nav = NAV.filter((n) => n.roles.includes(rol));
  // Cada pantalla solo se muestra a los roles que corresponden (la URL de una sesión anterior no concede acceso)
  const R = (roles: Rol[], el: JSX.Element) => (roles.includes(rol) ? el : <Navigate to={inicio} replace />);
  const OJ: Rol[] = ['Operador', 'Jefe'];
  return (
    <div className="app">
      <header className="top">
        <span className="marca">🌳 Dictaminado</span>
        <Sincronizacion />
        <button onClick={() => logout()} aria-label={`${usuario.nombre_usuario} · Salir (cerrar sesión)`}>{usuario.nombre_usuario} · Salir</button>
      </header>
      <nav className="nav" aria-label="Principal">
        {nav.map((n) => (
          <NavLink key={n.a} to={n.a} className={({ isActive }) => (isActive ? 'activo' : '')}>
            {n.t}{n.a === '/tormenta' && hayTormenta && <span className="tormenta-pulso" aria-label="Hay solicitudes de tormenta pendientes" />}
          </NavLink>
        ))}
      </nav>
      <main className="main">
        {sinConexion && <div className="aviso" role="status">Reanudaste la sesión sin señal. Al volver la conexión se vuelve a validar tu usuario.</div>}
        {!sync.online && <div className="aviso" role="status">Sin conexión: podés dictaminar las solicitudes de tu ruta ya generada; se enviarán solas cuando haya señal.</div>}
        <Pendientes />
        <Routes>
          <Route path="/solicitudes" element={R(OJ, <Solicitudes />)} />
          <Route path="/solicitudes/:sua/:anio" element={R(OJ, <SolicitudDetalle />)} />
          <Route path="/ruta" element={R(OJ, <MiRuta />)} />
          <Route path="/dictamen/:sua/:anio" element={R(OJ, <DictamenForm />)} />
          <Route path="/tormenta" element={<Tormenta />} />
          <Route path="/dashboard" element={R(['Jefe', 'Administrador', 'Lector'], <Dashboard />)} />
          <Route path="/usuarios" element={R(['Administrador'], <Usuarios />)} />
          <Route path="/auditoria" element={R(['Administrador'], <Auditoria />)} />
          <Route path="/revision" element={R(['Administrador'], <Revision />)} />
          <Route path="*" element={<Navigate to={inicio} replace />} />
        </Routes>
      </main>
    </div>
  );
}
