import { config } from '../config';

interface Estado { fallos: number[]; bloqueadoHasta: number; bloqueos: number }

/**
 * RNF-19: máximo de intentos fallidos por combinación IP + usuario en una ventana (10 / 15 min), también para
 * usuarios inexistentes. Tras superarlo hay un bloqueo con espera creciente entre bloqueos sucesivos.
 * (Capa distinta del bloqueo local de 5 intentos del captor, RF-52.)
 */
export class LoginThrottle {
  private m = new Map<string, Estado>();
  private clave(ip: string, usuario: string) { return `${ip}|${usuario.trim().toLowerCase()}`; }

  /** Segundos que faltan para poder reintentar; 0 si no está bloqueado. */
  restante(ip: string, usuario: string, ahora = Date.now()): number {
    const e = this.m.get(this.clave(ip, usuario));
    if (!e || e.bloqueadoHasta <= ahora) return 0;
    return Math.ceil((e.bloqueadoHasta - ahora) / 1000);
  }

  registrarFallo(ip: string, usuario: string, ahora = Date.now()) {
    const k = this.clave(ip, usuario);
    const e = this.m.get(k) ?? { fallos: [], bloqueadoHasta: 0, bloqueos: 0 };
    e.fallos = e.fallos.filter((t) => ahora - t < config.loginWindowMs);
    e.fallos.push(ahora);
    if (e.fallos.length >= config.loginMaxFails) {
      e.bloqueos += 1;
      // espera creciente: ventana × 2^(bloqueos-1), con tope de 8 horas
      e.bloqueadoHasta = ahora + Math.min(config.loginWindowMs * 2 ** (e.bloqueos - 1), 8 * 3600 * 1000);
      e.fallos = [];
    }
    this.m.set(k, e);
  }

  registrarExito(ip: string, usuario: string) {
    const e = this.m.get(this.clave(ip, usuario));
    if (e) { e.fallos = []; }
  }

  reset() { this.m.clear(); }
}

export const throttle = new LoginThrottle();
