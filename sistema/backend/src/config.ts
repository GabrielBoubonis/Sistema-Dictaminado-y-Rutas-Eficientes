import { AsyncLocalStorage } from 'async_hooks';

/** Origen del navegador del pedido en curso (cabecera Origin); lo fija el middleware de app.ts. */
export const origenDelPedido = new AsyncLocalStorage<string | undefined>();

// Configuración leída del entorno en cada acceso (permite cambiarla en los tests).
export const config = {
  get port() { return Number(process.env.PORT ?? 3000); },
  get jwtSecret() { return process.env.JWT_SECRET ?? 'dev-secret-cambiar-en-produccion'; },
  get accessTtlSeconds() { return Number(process.env.ACCESS_TTL_SECONDS ?? 30 * 60); }, // RF-04: 30 min
  get refreshCapMs() { return Number(process.env.REFRESH_CAP_MS ?? 7 * 24 * 3600 * 1000); }, // RNF-20: 7 días
  get loginMaxFails() { return Number(process.env.LOGIN_MAX_FAILS ?? 10); }, // RNF-19
  get loginWindowMs() { return Number(process.env.LOGIN_WINDOW_MS ?? 15 * 60 * 1000); },
  get orsKey() { return process.env.ORS_API_KEY || ''; },
  // Geocodificador: 'georef' (por defecto: altura exacta con datos del INDEC, respaldo Nominatim), 'nominatim'
  // (solo OpenStreetMap), 'ors' (requiere ORS_API_KEY) o 'mock'. Todos gratuitos.
  get geocoder() { return process.env.GEOCODER || 'georef'; },
  get georefUrl() { return process.env.GEOREF_URL ?? 'https://apis.datos.gob.ar/georef/api'; },
  get nominatimUrl() { return process.env.NOMINATIM_URL ?? 'https://nominatim.openstreetmap.org'; },
  get nominatimContacto() { return process.env.NOMINATIM_CONTACTO ?? 'arbolado-rosario-tp'; },
  get sede() {
    return { lat: Number(process.env.SEDE_LAT ?? -32.96239), lng: Number(process.env.SEDE_LNG ?? -60.65576) }; // Mariano Moreno 2350
  },
  // WebAuthn: si no se fijan WEBAUTHN_RP_ID / WEBAUTHN_ORIGIN se toman del Origin del navegador (sirve para
  // probar desde el celular por cualquier URL, p. ej. un túnel). En producción conviene fijarlos.
  get rpId() {
    if (process.env.WEBAUTHN_RP_ID) return process.env.WEBAUTHN_RP_ID;
    const o = origenDelPedido.getStore();
    try { return o ? new URL(o).hostname : 'localhost'; } catch { return 'localhost'; }
  },
  get origin() { return process.env.WEBAUTHN_ORIGIN ?? origenDelPedido.getStore() ?? 'http://localhost:5173'; },
  get uploadsDir() { return process.env.UPLOADS_DIR ?? 'uploads'; },
  get isProd() { return process.env.NODE_ENV === 'production'; },
};
