// Configuración leída del entorno en cada acceso (permite cambiarla en los tests).
export const config = {
  get port() { return Number(process.env.PORT ?? 3000); },
  get jwtSecret() { return process.env.JWT_SECRET ?? 'dev-secret-cambiar-en-produccion'; },
  get accessTtlSeconds() { return Number(process.env.ACCESS_TTL_SECONDS ?? 30 * 60); }, // RF-04: 30 min
  get refreshCapMs() { return Number(process.env.REFRESH_CAP_MS ?? 7 * 24 * 3600 * 1000); }, // RNF-20: 7 días
  get loginMaxFails() { return Number(process.env.LOGIN_MAX_FAILS ?? 10); }, // RNF-19
  get loginWindowMs() { return Number(process.env.LOGIN_WINDOW_MS ?? 15 * 60 * 1000); },
  get orsKey() { return process.env.ORS_API_KEY || ''; },
  get sede() {
    return { lat: Number(process.env.SEDE_LAT ?? -32.9468), lng: Number(process.env.SEDE_LNG ?? -60.6393) };
  },
  get rpId() { return process.env.WEBAUTHN_RP_ID ?? 'localhost'; },
  get origin() { return process.env.WEBAUTHN_ORIGIN ?? 'http://localhost:5173'; },
  get uploadsDir() { return process.env.UPLOADS_DIR ?? 'uploads'; },
  get isProd() { return process.env.NODE_ENV === 'production'; },
};
