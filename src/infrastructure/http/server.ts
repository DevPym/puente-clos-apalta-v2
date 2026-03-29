import express from 'express';
import { healthRouter } from './routes/health.route.js';
import type { ILogger } from '../../shared/logger/logger.js';

export function createServer(logger: ILogger) {
  const app = express();

  app.use(express.json());
  app.use(healthRouter);

  logger.info('Express server configured');

  return app;
}

export function startServer(
  app: ReturnType<typeof createServer>,
  port: number,
  logger: ILogger,
): void {
  app.listen(port, '::', () => {
    logger.info(`Server listening on port ${port}`);
  });
}
