import type { ReactNode } from 'react';
import { ApiError, ErrorRed } from '../lib/api';

export const textoError = (e: unknown) =>
  e instanceof ErrorRed ? 'No hay conexión con el servidor.' : e instanceof ApiError ? e.message : 'Ocurrió un error inesperado.';

export function Modal({ titulo, children, onCerrar }: { titulo: string; children: ReactNode; onCerrar?: () => void }) {
  return (
    <div className="modal-fondo" role="dialog" aria-modal="true" aria-label={titulo} onClick={(e) => { if (e.target === e.currentTarget) onCerrar?.(); }}>
      <div className="modal"><h2 style={{ marginTop: 0 }}>{titulo}</h2>{children}</div>
    </div>
  );
}

export const fechaCorta = (f: string | Date) => new Date(f).toLocaleDateString('es-AR', { timeZone: 'UTC' });
export const fechaHora = (f: string | Date) => new Date(f).toLocaleString('es-AR');

export function Estado({ estado }: { estado: string }) {
  const clase = estado === 'Dictaminada' ? '' : estado === 'Pendiente-revisión' ? 'warn' : 'info';
  return <span className={`badge ${clase}`}>{estado}</span>;
}
export function Prioridad({ p }: { p: string }) { return <span className="badge">{p}</span>; }

export function Paginacion({ total, pagina, porPagina, onPagina }: { total: number; pagina: number; porPagina: number; onPagina: (n: number) => void }) {
  const desde = total ? (pagina - 1) * porPagina + 1 : 0, hasta = Math.min(total, pagina * porPagina);
  return (
    <div className="fila sb" style={{ margin: '.8rem 0' }}>
      <span className="ayuda">Mostrando {desde}–{hasta} de {total}</span>
      <span className="fila">
        <button className="btn sec chico" disabled={pagina <= 1} onClick={() => onPagina(pagina - 1)}>‹ Anterior</button>
        <button className="btn sec chico" disabled={hasta >= total} onClick={() => onPagina(pagina + 1)}>Siguiente ›</button>
      </span>
    </div>
  );
}
