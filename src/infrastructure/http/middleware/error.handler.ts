import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../../../shared/errors/app.errors.js';
import type { ILogger } from '../../../shared/logger/logger.js';

export function createErrorHandler(logger: ILogger) {
  return (err: Error, _req: Request, res: Response, _next: NextFunction): void => {
    if (err instanceof AppError) {
      logger.error(err.message, {
        code: err.code,
        statusCode: err.statusCode,
        ...(err.context ?? {}),
      });
      res.status(err.statusCode).json({ error: err.code });
      return;
    }

    logger.error('Unhandled error', { error: err.message });
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  };
}
