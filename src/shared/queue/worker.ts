import type { QueueRepository, QueueJob } from './queue.repository.js';
import type { DlqRepository } from '../dlq/dlq.repository.js';
import type { SyncLogRepository } from '../logger/sync-log.repository.js';
import type { ILogger } from '../logger/logger.js';
import type { JobType } from '../../domain/types/common.types.js';

export type JobHandler = (job: QueueJob) => Promise<{ oracleId?: string }>;

export interface WorkerConfig {
  pollIntervalMs: number;
}

export class Worker {
  private running = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private handlers = new Map<string, JobHandler>();

  constructor(
    private readonly queue: QueueRepository,
    private readonly dlq: DlqRepository,
    private readonly syncLog: SyncLogRepository,
    private readonly logger: ILogger,
    private readonly config: WorkerConfig = { pollIntervalMs: 500 },
  ) {}

  registerHandler(jobType: JobType, handler: JobHandler): void {
    this.handlers.set(jobType, handler);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.logger.info('Worker started', { pollIntervalMs: this.config.pollIntervalMs });
    this.poll();
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.logger.info('Worker stopped');
  }

  private poll(): void {
    if (!this.running) return;

    this.processNext()
      .then((processed) => {
        // If we processed a job, poll immediately. Otherwise wait.
        const delay = processed ? 0 : this.config.pollIntervalMs;
        this.timer = setTimeout(() => this.poll(), delay);
      })
      .catch((err) => {
        this.logger.error('Worker poll error', {
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
        });
        this.timer = setTimeout(() => this.poll(), this.config.pollIntervalMs);
      });
  }

  private async processNext(): Promise<boolean> {
    const job = await this.queue.dequeue();
    if (!job) return false;

    const handler = this.handlers.get(job.type);
    if (!handler) {
      this.logger.error('No handler registered for job type', { jobType: job.type, jobId: job.id });
      await this.queue.fail(job.id, 'No handler registered', 'WORKER_NO_HANDLER');
      return true;
    }

    const startMs = Date.now();
    try {
      const result = await handler(job);
      await this.queue.complete(job.id);

      await this.syncLog.log({
        jobId: job.id,
        jobType: job.type,
        objectId: job.objectId,
        oracleId: result.oracleId ?? null,
        direction: 'hubspot-to-oracle',
        status: 'success',
        errorCode: null,
        errorMessage: null,
        durationMs: Date.now() - startMs,
        metadata: null,
      });

      this.logger.info('Job completed', {
        jobId: job.id,
        jobType: job.type,
        objectId: job.objectId,
        durationMs: Date.now() - startMs,
      });

      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const errorCode = this.extractErrorCode(err);
      const durationMs = Date.now() - startMs;

      const { sentToDlq } = await this.queue.fail(job.id, errorMessage, errorCode);

      if (sentToDlq) {
        await this.dlq.insert({
          id: job.id,
          jobType: job.type,
          objectId: job.objectId,
          payload: { type: job.type, objectId: job.objectId },
          errorCode,
          firstError: errorMessage,
          lastError: errorMessage,
          attempts: job.attempts + 1,
          createdAt: job.createdAt,
          failedAt: new Date(),
        });

        this.logger.error('Job sent to DLQ', {
          jobId: job.id,
          jobType: job.type,
          objectId: job.objectId,
          errorCode,
          attempts: job.attempts + 1,
        });
      }

      await this.syncLog.log({
        jobId: job.id,
        jobType: job.type,
        objectId: job.objectId,
        oracleId: null,
        direction: 'hubspot-to-oracle',
        status: sentToDlq ? 'error' : 'retry',
        errorCode,
        errorMessage,
        durationMs,
        metadata: null,
      });

      this.logger.error('Job failed', {
        jobId: job.id,
        jobType: job.type,
        objectId: job.objectId,
        errorCode,
        attempt: job.attempts + 1,
        sentToDlq,
        durationMs,
      });

      return true;
    }
  }

  private extractErrorCode(err: unknown): string {
    if (err && typeof err === 'object' && 'code' in err) {
      return String((err as { code: string }).code);
    }
    return 'UNKNOWN';
  }
}
