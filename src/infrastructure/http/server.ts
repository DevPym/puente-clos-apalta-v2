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

  // Verify routes — consulta Oracle para verificar registros sincronizados
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
  // Raw Oracle API proxy — query param instead of path (Express 5 compat)
  // Usage: /verify/raw?path=/crm/v1/profiles/12345
  app.get('/verify/raw', async (req, res) => {
    const oraclePath = req.query.path as string;
    if (!oraclePath) { res.status(400).json({ error: 'Missing ?path= query param' }); return; }
    const result = await oracle.rawGet(oraclePath);
    if (!result.ok) { res.status(500).json({ error: result.error.message, code: result.error.code }); return; }
    res.json(result.data);
  });

  // Test endpoint — probar diferentes formatos de TravelAgent payload contra Oracle
  // Usage: GET /test/travel-agent?resId=42872642&agentId=37522366&format=1
  app.get('/test/travel-agent', async (req, res) => {
    const resId = req.query.resId as string;
    const agentId = req.query.agentId as string;
    const format = req.query.format as string ?? '1';
    if (!resId || !agentId) {
      res.status(400).json({ error: 'Missing ?resId= and ?agentId=' });
      return;
    }

    const payloads: Record<string, unknown> = {
      // Formato 1: reservationProfiles separado (el original)
      '1': {
        reservations: { reservation: [{
          reservationProfiles: {
            reservationProfile: [{
              profileIdList: [{ id: agentId, type: 'Profile' }],
              reservationProfileType: 'TravelAgent',
            }],
          },
        }] },
      },
      // Formato 2: reservationGuests con profile.profileType = Agent
      '2': {
        reservations: { reservation: [{
          reservationGuests: [{
            profileInfo: {
              profileIdList: [{ id: agentId, type: 'Profile' }],
              profile: { profileType: 'Agent' },
            },
          }],
        }] },
      },
      // Formato 3: reservationGuests con reservationProfileType = TravelAgent
      '3': {
        reservations: { reservation: [{
          reservationGuests: [{
            profileInfo: {
              profileIdList: [{ id: agentId, type: 'Profile' }],
              profile: { profileType: 'TravelAgent' },
            },
            reservationProfileType: 'TravelAgent',
          }],
        }] },
      },
      // Formato 4: stayProfiles en roomRate
      '4': {
        reservations: { reservation: [{
          roomStay: {
            roomRates: [{
              stayProfiles: [{
                profileIdList: [{ id: agentId, type: 'Profile' }],
                reservationProfileType: 'TravelAgent',
              }],
            }],
          },
        }] },
      },
      // Formato 5: reservationProfiles con commissionPayoutTo
      '5': {
        reservations: { reservation: [{
          reservationProfiles: {
            reservationProfile: [{
              profileIdList: [{ id: agentId, type: 'Profile' }],
              reservationProfileType: 'TravelAgent',
            }],
            commissionPayoutTo: 'TravelAgent',
          },
        }] },
      },
    };

    const payload = payloads[format];
    if (!payload) {
      res.status(400).json({ error: `Invalid format. Valid: 1-5`, formats: Object.keys(payloads) });
      return;
    }

    try {
      const result = await oracle.rawPut(`/rsv/v1/hotels/CAR/reservations/${resId}`, payload);
      res.json({ format, payload, oracleResponse: result });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ format, payload, error: msg });
    }
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
