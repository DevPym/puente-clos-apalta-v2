import express from 'express';
import { healthRouter } from './routes/health.route.js';
import { createWebhookRouter } from './routes/webhook.route.js';
import { createSyncRouter } from './routes/sync.route.js';
import { createDlqRouter } from './routes/dlq.route.js';
import { createWebhookVerifyMiddleware } from './middleware/webhook.verify.js';
import { createErrorHandler } from './middleware/error.handler.js';
import type { ILogger } from '../../shared/logger/logger.js';
import type { QueueRepository } from '../../shared/queue/queue.repository.js';
import type { DlqRepository } from '../../shared/dlq/dlq.repository.js';
import type { IOracleClient } from '../../domain/ports/oracle.port.js';

export interface ServerDeps {
  logger: ILogger;
  queue: QueueRepository;
  dlq: DlqRepository;
  oracle: IOracleClient;
  hubspotClientSecret: string;
}

export function createServer(deps: ServerDeps) {
  const { logger, queue, dlq, oracle, hubspotClientSecret } = deps;
  const app = express();

  // Confiar en el proxy de Railway para x-forwarded-proto y x-forwarded-for
  app.set('trust proxy', 1);

  // Raw body capture for webhook signature verification
  app.use(express.json({
    verify: (req, _res, buf) => {
      (req as express.Request & { rawBody?: string }).rawBody = buf.toString();
    },
  }));

  // Health check (no auth)
  app.use(healthRouter);

  // Webhook route (with HubSpot signature verification)
  const webhookVerify = createWebhookVerifyMiddleware(hubspotClientSecret);
  const webhookRouter = createWebhookRouter(queue, logger);
  app.use('/webhook', webhookVerify, webhookRouter);

  // Admin/sync routes (no auth in phase 1)
  app.use(createSyncRouter(queue, logger));
  app.use(createDlqRouter(dlq, queue, logger));

  // Verify route — consulta Oracle para verificar registros sincronizados
  app.get('/verify/guest/:oracleId', async (req, res) => {
    const result = await oracle.getGuestProfile(req.params.oracleId);
    if (!result.ok) { res.status(500).json({ error: result.error.message }); return; }
    res.json(result.data);
  });
  app.get('/verify/reservation/:oracleId', async (req, res) => {
    const result = await oracle.getReservation(req.params.oracleId);
    if (!result.ok) { res.status(500).json({ error: result.error.message }); return; }
    res.json(result.data);
  });

  // Global error handler
  app.use(createErrorHandler(logger));

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
