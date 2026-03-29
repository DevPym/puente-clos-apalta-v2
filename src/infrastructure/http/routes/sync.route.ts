import { Router } from 'express';
import type { QueueRepository } from '../../../shared/queue/queue.repository.js';
import type { ILogger } from '../../../shared/logger/logger.js';
import type { JobType } from '../../../domain/types/common.types.js';

export function createSyncRouter(queue: QueueRepository, logger: ILogger): Router {
  const router = Router();

  router.get('/sync-to-oracle/:hsId', async (req, res) => {
    const { hsId } = req.params;
    const jobType = (req.query.type as string) ?? 'contact.create';

    const validTypes: JobType[] = [
      'contact.create', 'contact.update',
      'deal.create', 'deal.update',
      'company.create', 'company.update',
    ];

    if (!validTypes.includes(jobType as JobType)) {
      res.status(400).json({ error: `Invalid job type. Valid: ${validTypes.join(', ')}` });
      return;
    }

    const job = await queue.enqueue(jobType as JobType, hsId);
    logger.info('Manual sync enqueued', { hsId, jobType, jobId: job.id });

    res.status(202).json({ jobId: job.id, type: jobType, objectId: hsId, status: 'enqueued' });
  });

  return router;
}
