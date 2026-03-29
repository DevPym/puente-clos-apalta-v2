import { Router } from 'express';
import type { DlqRepository } from '../../../shared/dlq/dlq.repository.js';
import type { QueueRepository } from '../../../shared/queue/queue.repository.js';
import type { ILogger } from '../../../shared/logger/logger.js';
import type { JobType } from '../../../domain/types/common.types.js';

export function createDlqRouter(
  dlq: DlqRepository,
  queue: QueueRepository,
  logger: ILogger,
): Router {
  const router = Router();

  router.get('/admin/dlq', async (req, res) => {
    const status = req.query.status as string | undefined;
    const jobType = req.query.jobType as string | undefined;

    let entries;
    if (jobType) {
      entries = await dlq.findByJobType(jobType as JobType);
    } else if (status === 'pending') {
      entries = await dlq.findPending();
    } else {
      entries = await dlq.findPending();
    }

    res.json({ count: entries.length, entries });
  });

  router.get('/admin/dlq/stats', async (_req, res) => {
    const stats = await dlq.getStats();
    res.json(stats);
  });

  router.post('/admin/dlq/:jobId/resolve', async (req, res) => {
    const { jobId } = req.params;
    await dlq.markResolved(jobId, 'manual');
    logger.info('DLQ entry resolved manually', { jobId });
    res.json({ jobId, status: 'resolved' });
  });

  router.post('/admin/dlq/:jobId/ignore', async (req, res) => {
    const { jobId } = req.params;
    await dlq.markIgnored(jobId);
    logger.info('DLQ entry ignored', { jobId });
    res.json({ jobId, status: 'ignored' });
  });

  router.post('/admin/dlq/:jobId/retry', async (req, res) => {
    const { jobId } = req.params;
    const entries = await dlq.findByObjectId(jobId);

    if (entries.length === 0) {
      res.status(404).json({ error: 'DLQ entry not found' });
      return;
    }

    const entry = entries[0];
    const job = await queue.enqueue(entry.jobType as JobType, entry.objectId);
    await dlq.markResolved(entry.id, 'retry');
    logger.info('DLQ entry re-enqueued', { dlqId: entry.id, newJobId: job.id });

    res.json({ jobId: job.id, type: entry.jobType, objectId: entry.objectId, status: 'enqueued' });
  });

  return router;
}
