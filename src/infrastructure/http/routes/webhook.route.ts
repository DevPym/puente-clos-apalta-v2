import { Router } from 'express';
import { z } from 'zod';
import type { QueueRepository } from '../../../shared/queue/queue.repository.js';
import type { ILogger } from '../../../shared/logger/logger.js';
import type { JobType } from '../../../domain/types/common.types.js';

const webhookEventSchema = z.object({
  objectId: z.number(),
  subscriptionType: z.enum([
    'contact.creation', 'contact.propertyChange', 'contact.deletion',
    'deal.creation', 'deal.propertyChange', 'deal.deletion',
    'company.creation', 'company.propertyChange', 'company.deletion',
  ]),
  propertyName: z.string().optional(),
  propertyValue: z.string().optional(),
  occurredAt: z.number(),
  attemptNumber: z.number(),
});

const webhookBodySchema = z.array(webhookEventSchema);

// Map subscription types to job types
const JOB_TYPE_MAP: Record<string, JobType> = {
  'contact.creation': 'contact.create',
  'contact.propertyChange': 'contact.update',
  'deal.creation': 'deal.create',
  'deal.propertyChange': 'deal.update',
  'deal.deletion': 'deal.delete',
  'company.creation': 'company.create',
  'company.propertyChange': 'company.update',
};

// In-memory dedup: key → timestamp. TTL 10s, cleanup every 60s.
const dedupMap = new Map<string, number>();
const DEDUP_TTL_MS = 10_000;

setInterval(() => {
  const now = Date.now();
  for (const [key, ts] of dedupMap) {
    if (now - ts > DEDUP_TTL_MS) dedupMap.delete(key);
  }
}, 60_000).unref();

function isDuplicate(objectId: number, subscriptionType: string): boolean {
  const key = `${objectId}:${subscriptionType}`;
  const existing = dedupMap.get(key);
  if (existing && Date.now() - existing < DEDUP_TTL_MS) return true;
  dedupMap.set(key, Date.now());
  return false;
}

export function createWebhookRouter(queue: QueueRepository, logger: ILogger): Router {
  const router = Router();

  router.post('/webhook/hubspot', async (req, res) => {
    const parsed = webhookBodySchema.safeParse(req.body);
    if (!parsed.success) {
      logger.warn('Invalid webhook payload', { error: parsed.error.flatten() });
      res.status(400).json({ error: 'WEBHOOK_PAYLOAD_INVALID' });
      return;
    }

    // Check queue capacity
    const queueSize = await queue.size();
    if (queueSize >= 1000) {
      logger.error('Queue full, rejecting webhook', { queueSize });
      res.status(503).json({ error: 'QUEUE_FULL' });
      return;
    }

    let enqueued = 0;
    for (const event of parsed.data) {
      const jobType = JOB_TYPE_MAP[event.subscriptionType];
      if (!jobType) continue; // Ignore unsupported subscription types (e.g. contact.deletion)

      if (isDuplicate(event.objectId, event.subscriptionType)) {
        logger.info('Duplicate webhook event, skipping', {
          objectId: event.objectId,
          subscriptionType: event.subscriptionType,
        });
        continue;
      }

      await queue.enqueue(jobType, String(event.objectId));
      enqueued++;
    }

    logger.info('Webhook processed', { events: parsed.data.length, enqueued });
    res.status(200).json({ received: true });
  });

  return router;
}
