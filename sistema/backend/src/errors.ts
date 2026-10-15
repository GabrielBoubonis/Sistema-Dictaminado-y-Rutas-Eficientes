import { NextFunction, Request, Response } from 'express';
import { ZodError, ZodTypeAny, z } from 'zod';

export class AppError extends Error {
  constructor(public status: number, public code: string, message?: string, public extra?: Record<string, unknown>) {
    super(message ?? code);
  }
}

export function validar<T extends ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) {
    throw new AppError(422, 'datos_invalidos', 'Hay datos inválidos', {
      detalles: r.error.issues.map((i) => ({ campo: i.path.join('.'), mensaje: i.message })),
    });
  }
  return r.data;
}

// Envuelve handlers async para que los errores lleguen al middleware de errores.
export const ah = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => { fn(req, res, next).catch(next); };

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.code, mensaje: err.message, ...(err.extra ?? {}) });
  }
  if (err instanceof ZodError) {
    return res.status(422).json({ error: 'datos_invalidos', detalles: err.issues });
  }
  const anyErr = err as { type?: string; status?: number };
  if (anyErr?.type === 'entity.too.large') return res.status(413).json({ error: 'payload_muy_grande' });
  if (anyErr?.type === 'entity.parse.failed') return res.status(400).json({ error: 'json_invalido' });
  console.error(err);
  return res.status(500).json({ error: 'error_interno' });
}
