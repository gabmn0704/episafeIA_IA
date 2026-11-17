import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import type { Logger } from './logger.js';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown[],
  ) {
    super(message);
  }
}

/** Uniform error body shared with the rest of EpiSafe: { error: { code, message, details } } */
export function errorBody(code: string, message: string, details: unknown[] = []) {
  return { error: { code, message, details } };
}

export const notFound: RequestHandler = (req, res) => {
  res.status(404).json(errorBody('NOT_FOUND', `Ruta no encontrada: ${req.method} ${req.path}`));
};

export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (err, req, res, _next) => {
    if (err instanceof ZodError) {
      const details = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
      res.status(400).json(errorBody('VALIDATION_ERROR', 'Datos de entrada no válidos', details));
      return;
    }
    if (err instanceof HttpError) {
      res.status(err.status).json(errorBody(err.code, err.message, err.details));
      return;
    }
    const type = (err as { type?: string } | undefined)?.type;
    if (type === 'entity.too.large') {
      res.status(413).json(errorBody('PAYLOAD_TOO_LARGE', 'La solicitud es demasiado grande'));
      return;
    }
    if (type === 'entity.parse.failed') {
      res.status(400).json(errorBody('INVALID_JSON', 'El cuerpo no es JSON válido'));
      return;
    }
    logger.error('unhandled error', { method: req.method, path: req.path, error: err instanceof Error ? err.message : String(err) });
    res.status(500).json(errorBody('INTERNAL_ERROR', 'Error interno del servicio de IA'));
  };
}
