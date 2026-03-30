import { Router } from 'express';
import { z } from 'zod';
import type { QueueRepository } from '../../../shared/queue/queue.repository.js';
import type { ILogger } from '../../../shared/logger/logger.js';
import type { JobType } from '../../../domain/types/common.types.js';

// HubSpot objectTypeId for Appointments (standard object 0-421)
const APPOINTMENT_OBJECT_TYPE_ID = '0-421';

// Schema flexible: acepta todos los event types que HubSpot envía.
// Los que no mapeamos a un job se ignoran silenciosamente (no 400).
const webhookEventSchema = z.object({
  objectId: z.number(),
  subscriptionType: z.string(),       // flexible: contact.creation, object.creation, etc.
  objectTypeId: z.string().optional(), // presente en object.* events (ej: "0-421" para appointments)
  propertyName: z.string().optional(),
  propertyValue: z.string().optional(),
  occurredAt: z.number(),
  attemptNumber: z.number(),
});

const webhookBodySchema = z.array(webhookEventSchema);

// Map standard CRM subscription types to job types
const JOB_TYPE_MAP: Record<string, JobType> = {
  'contact.creation': 'contact.create',
  'contact.propertyChange': 'contact.update',
  'deal.creation': 'deal.create',
  'deal.propertyChange': 'deal.update',
  'deal.deletion': 'deal.delete',
  'company.creation': 'company.create',
  'company.propertyChange': 'company.update',
};

// Map object.* events by objectTypeId to job types
const OBJECT_JOB_TYPE_MAP: Record<string, Record<string, JobType>> = {
  [APPOINTMENT_OBJECT_TYPE_ID]: {
    'object.creation': 'appointment.create',
    'object.propertyChange': 'appointment.update',
  },
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

  router.post('/hubspot', async (req, res) => {
    const parsed = webhookBodySchema.safeParse(req.body);
    if (!parsed.success) {
      // Log the raw payload shape to diagnose which field fails Zod validation
      const rawPreview = Array.isArray(req.body)
        ? req.body.slice(0, 2).map((e: Record<string, unknown>) => ({
            subscriptionType: e.subscriptionType,
            objectId: `${typeof e.objectId}:${e.objectId}`,
            objectTypeId: e.objectTypeId,
            occurredAt: typeof e.occurredAt,
            attemptNumber: typeof e.attemptNumber,
          }))
        : { type: typeof req.body, isArray: false };
      logger.warn('Invalid webhook payload', { rawPreview, error: parsed.error.flatten() });
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
      // Resolve job type: standard CRM events or object.* events (appointments, etc.)
      let jobType: JobType | undefined = JOB_TYPE_MAP[event.subscriptionType];
      if (!jobType && event.objectTypeId) {
        const objectMap = OBJECT_JOB_TYPE_MAP[event.objectTypeId];
        if (objectMap) jobType = objectMap[event.subscriptionType];
      }
      if (!jobType) continue; // Ignore unsupported types (merge, restore, associationChange, etc.)

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
