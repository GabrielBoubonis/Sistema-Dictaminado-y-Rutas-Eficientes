import fs from 'fs';
import path from 'path';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { errorHandler } from './errors';
import { prisma } from './db';
import { throttle } from './middleware/throttle';
import { securityHeaders } from './security';
import { authRouter } from './routes/auth';
import { usuariosRouter } from './routes/usuarios';
import { solicitudesRouter } from './routes/solicitudes';
import { rutasRouter } from './routes/rutas';
import { dictamenesRouter } from './routes/dictamenes';
import { syncRouter } from './routes/sync';
import { especiesRouter } from './routes/especies';
import { revisionRouter } from './routes/revision';
import { auditoriaRouter } from './routes/auditoria';
import { dashboardRouter } from './routes/dashboard';
import { tormentaRouter } from './routes/tormenta';
import { origenDelPedido } from './config';
import { providers, MockAuthProvider, MockReclamoProvider, MockMatriz, MockGeocoder } from './providers';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
  // WebAuthn: rpId/origin del pedido a partir de la cabecera Origin (ver config.ts)
  app.use((req, _res, next) => {
    const o = req.headers.origin;
    origenDelPedido.run(typeof o === 'string' && /^https?:\/\/[^/\s]+$/.test(o) ? o : undefined, next);
  });
  app.use(securityHeaders);
  app.use(express.json({ limit: '25mb' }));

  const api = express.Router();
  // Capa general contra abuso (distinta del límite de intentos fallidos de RNF-19)
  api.use('/auth', rateLimit({ windowMs: 60 * 1000, limit: process.env.NODE_ENV === 'test' ? 10000 : 120, standardHeaders: true, legacyHeaders: false }));
  api.get('/health', (_req, res) => res.json({ ok: true }));
  api.use('/auth', authRouter);
  api.use('/usuarios', usuariosRouter);
  api.use('/solicitudes', solicitudesRouter);
  api.use('/rutas', rutasRouter);
  api.use('/dictamenes', dictamenesRouter);
  api.use('/sync', syncRouter);
  api.use('/especies', especiesRouter);
  api.use('/revision', revisionRouter);
  api.use('/auditoria', auditoriaRouter);
  api.use('/dashboard', dashboardRouter);
  api.use('/tormenta', tormentaRouter);

  // Solo desarrollo: simular caídas de servicios externos para probar los casos de borde.
  if (process.env.NODE_ENV !== 'production') {
    api.post('/dev/simular', (req, res) => {
      const b = req.body ?? {};
      if (providers.auth instanceof MockAuthProvider && typeof b.auth === 'boolean') providers.auth.caido = b.auth;
      if (providers.reclamo instanceof MockReclamoProvider && typeof b.sua === 'boolean') providers.reclamo.caido = b.sua;
      if (providers.matriz instanceof MockMatriz && typeof b.ors === 'boolean') providers.matriz.caido = b.ors;
      if (providers.geocoder instanceof MockGeocoder && typeof b.geocoder === 'boolean') providers.geocoder.falla = b.geocoder;
      res.json({ ok: true });
    });
    api.post('/dev/reset-throttle', (_req, res) => { throttle.reset(); res.json({ ok: true }); });
    // Alta/baja en la Autenticación Institucional simulada (en producción la administra la institución).
    api.post('/dev/institucional', async (req, res) => {
      const { nombre_usuario, vigente = true } = req.body ?? {};
      if (typeof nombre_usuario !== 'string' || !nombre_usuario) return res.status(422).json({ error: 'datos_invalidos' });
      await prisma.usuarioInstitucional.upsert({ where: { nombre_usuario }, create: { nombre_usuario, vigente: !!vigente, nombre_completo: nombre_usuario }, update: { vigente: !!vigente } });
      res.json({ ok: true });
    });
  }

  app.use('/api', api);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'no_encontrado' }));
  // La PWA compilada (frontend/dist) se sirve desde el mismo origen: así WebAuthn, CSP y el service worker coinciden.
  const dist = process.env.FRONTEND_DIR ?? path.resolve(__dirname, '../../frontend/dist');
  if (fs.existsSync(path.join(dist, 'index.html'))) {
    app.use(express.static(dist, { index: false, setHeaders: (res, f) => { if (/sw\.js$/.test(f)) res.setHeader('Cache-Control', 'no-cache'); } }));
    app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }
  app.use(errorHandler);
  return app;
}
