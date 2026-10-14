import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ApiError, ErrorRed, api, onApiEvento, refreshGuardado, renovar, setTokens } from './lib/api';
import { borrarDatosLocales, cacheSet, db } from './lib/db';
import { codigoDispositivo, guardarSesionLocal, MENSAJES_REANUDAR, reanudarSinConexion } from './lib/local-auth';
import { iniciarSync, sincronizar } from './lib/sync';

export type Rol = 'Lector' | 'Operador' | 'Jefe' | 'Administrador';
export interface Usuario { nombre_usuario: string; nombre_completo: string; rol: Rol }
type Fase = 'cargando' | 'anonimo' | 'autenticado' | 'bloqueado' | 'revocado';

interface Ctx {
  fase: Fase; usuario: Usuario | null; sinConexion: boolean; codigo: string | null; aviso: string | null;
  login(usuario: string, password: string): Promise<string | null>; // devuelve mensaje de error o null
  logout(motivo?: string): Promise<void>;
}
const AuthCtx = createContext<Ctx>(null as any);
export const useAuth = () => useContext(AuthCtx);

const MAX_INTENTOS_LOCALES = 5; // RF-52
const INACTIVIDAD_MS = 30 * 60 * 1000; // RF-04

function dispositivoId(): string {
  let id = localStorage.getItem('dispositivoId');
  if (!id) { id = crypto.randomUUID(); localStorage.setItem('dispositivoId', id); }
  return id;
}
const intentos = {
  get: () => Number(localStorage.getItem('intentosFallidos') ?? 0),
  set: (n: number) => localStorage.setItem('intentosFallidos', String(n)),
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [fase, setFase] = useState<Fase>('cargando');
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [sinConexion, setSinConexion] = useState(false);
  const [codigo, setCodigo] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const passMemoria = useRef<string | null>(null);
  const ultimaActividad = useRef(Date.now());

  const cerrar = useCallback(async (motivo?: string, borrar = false) => {
    try { if (!sinConexion) await api('/auth/logout', { method: 'POST', body: {} }); } catch { /* ya estaba cerrada */ }
    setTokens(null); passMemoria.current = null;
    if (borrar) await borrarDatosLocales();
    setUsuario(null); setSinConexion(false); setFase('anonimo'); setAviso(motivo ?? null);
  }, [sinConexion]);

  const bloquear = useCallback(async (cod?: string) => {
    setTokens(null); passMemoria.current = null; setUsuario(null);
    const c = cod ?? (await codigoDispositivo(dispositivoId()));
    localStorage.setItem('captorBloqueado', c);
    setCodigo(c); setFase('bloqueado');
  }, []);

  const entrar = useCallback(async (u: Usuario, offline: boolean) => {
    setUsuario(u); setSinConexion(offline); setFase('autenticado'); setAviso(null); ultimaActividad.current = Date.now();
    iniciarSync();
    if (!offline) { await cacheSet('usuario', u); void sincronizar(); }
  }, []);

  // Arranque: ¿captor bloqueado? ¿sesión vigente por refresh token?
  useEffect(() => {
    iniciarSync();
    (async () => {
      const cod = localStorage.getItem('captorBloqueado');
      if (cod) { setCodigo(cod); setFase('bloqueado'); return; }
      if (localStorage.getItem('captorRevocado')) { setFase('revocado'); return; }
      if (refreshGuardado() && (await renovar())) {
        try { const me = await api<Usuario>('/auth/me'); await entrar(me, false); return; } catch { /* cae al login */ }
      }
      setFase('anonimo');
    })();
  }, [entrar]);

  useEffect(() => onApiEvento((e) => {
    if (e === 'sesion-finalizada') {
      void (async () => {
        // ¿revocado por un Administrador? (RF-52) → se borran los datos locales
        try { await api(`/auth/dispositivo/${dispositivoId()}`, { sinAuth: true }).then(async (d) => { if (d.estado === 'Revocado') { localStorage.setItem('captorRevocado', '1'); await borrarDatosLocales(); setTokens(null); setUsuario(null); setFase('revocado'); } else await cerrar('Tu sesión se cerró. Ingresá de nuevo.'); }); }
        catch { await cerrar('Tu sesión se cerró. Ingresá de nuevo.'); }
      })();
    }
  }), [cerrar]);

  // Inactividad (RF-04)
  useEffect(() => {
    if (fase !== 'autenticado') return;
    const marcar = () => { ultimaActividad.current = Date.now(); };
    const ev = ['pointerdown', 'keydown', 'touchstart'];
    ev.forEach((e) => window.addEventListener(e, marcar, { passive: true }));
    const t = setInterval(() => { if (Date.now() - ultimaActividad.current > INACTIVIDAD_MS) void cerrar('Tu sesión se cerró por inactividad (30 minutos).'); }, 30_000);
    return () => { ev.forEach((e) => window.removeEventListener(e, marcar)); clearInterval(t); };
  }, [fase, cerrar]);

  // Captor bloqueado: consulta si un Administrador lo desbloqueó (RF-60)
  useEffect(() => {
    if (fase !== 'bloqueado') return;
    const t = setInterval(async () => {
      try {
        const d = await api<{ estado: string; codigo?: string }>(`/auth/dispositivo/${dispositivoId()}`, { sinAuth: true });
        if (d.estado === 'Activo') { localStorage.removeItem('captorBloqueado'); intentos.set(0); setFase('anonimo'); setAviso('El captor fue desbloqueado. Ya podés ingresar.'); }
        if (d.estado === 'Revocado') { localStorage.setItem('captorRevocado', '1'); await borrarDatosLocales(); setFase('revocado'); }
      } catch { /* sin señal: sigue bloqueado */ }
    }, 8000);
    return () => clearInterval(t);
  }, [fase]);

  // Sesión sin señal: al volver la conexión se revalida contra la Autenticación Institucional (RF-57)
  useEffect(() => {
    if (!sinConexion) return;
    const revalidar = async () => {
      if (!passMemoria.current || !usuario) return;
      try {
        const r = await api('/auth/login', { sinAuth: true, body: { usuario: usuario.nombre_usuario, password: passMemoria.current, dispositivoId: dispositivoId() } });
        setTokens({ accessToken: r.accessToken, refreshToken: r.refreshToken });
        setSinConexion(false); void sincronizar();
      } catch (e) {
        if (e instanceof ApiError && (e.status === 401 || e.status === 403 || e.status === 423)) await cerrar('Tu usuario ya no está vigente o cambió su contraseña. Ingresá de nuevo.');
      }
    };
    window.addEventListener('online', revalidar);
    if (navigator.onLine) void revalidar();
    return () => window.removeEventListener('online', revalidar);
  }, [sinConexion, usuario, cerrar]);

  const fallo = useCallback(async (mensaje: string): Promise<string> => {
    const n = intentos.get() + 1; intentos.set(n);
    if (n >= MAX_INTENTOS_LOCALES) { // RF-52: bloqueo local a los 5 intentos consecutivos
      try { const b = await api('/auth/dispositivo/bloqueo', { sinAuth: true, body: { dispositivoId: dispositivoId(), usuario: undefined } }); await bloquear(b.codigo); }
      catch { await bloquear(); }
      return 'Demasiados intentos fallidos: el captor quedó bloqueado.';
    }
    return `${mensaje} (intento ${n} de ${MAX_INTENTOS_LOCALES})`;
  }, [bloquear]);

  const login = useCallback(async (nombre: string, password: string): Promise<string | null> => {
    const did = dispositivoId();
    try {
      const r = await api('/auth/login', { sinAuth: true, body: { usuario: nombre, password, dispositivoId: did } });
      setTokens({ accessToken: r.accessToken, refreshToken: r.refreshToken });
      intentos.set(0);
      await guardarSesionLocal(r.usuario.nombre_usuario, r.usuario.nombre_completo, r.usuario.rol, password);
      await entrar(r.usuario, false);
      return null;
    } catch (e) {
      if (e instanceof ErrorRed || !navigator.onLine) {
        // Sin conexión: reanudar con la contraseña local (RF-57)
        const r = await reanudarSinConexion(nombre, password);
        if (r.ok) {
          passMemoria.current = password; intentos.set(0);
          await entrar({ nombre_usuario: r.sesion.usuario, nombre_completo: r.sesion.nombre_completo, rol: r.sesion.rol as Rol }, true);
          return null;
        }
        if (r.motivo === 'password') return fallo(MENSAJES_REANUDAR.password);
        return MENSAJES_REANUDAR[r.motivo];
      }
      if (e instanceof ApiError) {
        if (e.code === 'captor_bloqueado') { await bloquear(e.body.codigo); return null; }
        if (e.code === 'sesion_finalizada') { localStorage.setItem('captorRevocado', '1'); await borrarDatosLocales(); setFase('revocado'); return null; }
        if (e.status === 503) return e.message; // caída de la Autenticación Institucional: no cuenta como intento (RF-52)
        if (e.status === 429) return `${e.message}${e.body.reintentarEnSegundos ? ` Esperá ${Math.ceil(e.body.reintentarEnSegundos / 60)} min.` : ''}`;
        if (e.status === 401) return fallo(e.message);
        return e.message;
      }
      return 'Ocurrió un error inesperado';
    }
  }, [bloquear, entrar, fallo]);

  const valor = useMemo<Ctx>(() => ({ fase, usuario, sinConexion, codigo, aviso, login, logout: (m) => cerrar(m) }), [fase, usuario, sinConexion, codigo, aviso, login, cerrar]);
  return <AuthCtx.Provider value={valor}>{children}</AuthCtx.Provider>;
}
export { db };
