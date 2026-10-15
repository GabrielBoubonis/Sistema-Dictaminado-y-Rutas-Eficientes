import { Router } from 'express';
import { z } from 'zod';
import { AppError, ah, validar } from '../errors';
import { requireAuth, requireRol } from '../middleware/auth';
import { registrarDictamen } from '../services/registro-dictamen';

export const syncRouter = Router();
syncRouter.use(requireAuth, requireRol('Operador', 'Jefe'));

const lote = z.object({ dictamenes: z.array(z.object({ dictamen: z.record(z.any()), segundo_factor: z.any().optional() })).min(1).max(20) });

/**
 * RF-33 / RF-53: recibe la cola offline. Cada elemento se procesa de forma independiente e idempotente (por UUID).
 * `estado`: sincronizado | duplicado | rechazado. Solo un rechazo explícito corta los reintentos del cliente;
 * un error transitorio (`reintentar`) deja el dictamen en cola.
 */
syncRouter.post('/dictamenes', ah(async (req, res) => {
  const b = validar(lote, req.body);
  const orden = [...b.dictamenes].sort((x, y) => String(x.dictamen.fecha_firma).localeCompare(String(y.dictamen.fecha_firma)));
  const resultados = [];
  for (const it of orden) {
    const uuid = String(it.dictamen.uuid_dictamen ?? '');
    try {
      const r = await registrarDictamen(req.sesion!.usuario, it.dictamen, it.segundo_factor, 'sync');
      resultados.push({ ...r, uuid_dictamen: uuid, estado: r.duplicado ? 'duplicado' : 'sincronizado' });
    } catch (e) {
      if (e instanceof AppError) {
        resultados.push({ uuid_dictamen: uuid, estado: e.status >= 500 ? 'reintentar' : 'rechazado', error: e.code, mensaje: e.message, ...(e.extra ?? {}) });
      } else {
        console.error(e);
        resultados.push({ uuid_dictamen: uuid, estado: 'reintentar', error: 'error_interno' });
      }
    }
  }
  res.json({ resultados });
}));
