import { eq, and, lte, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Db } from '../db/client.js';
import { jobs } from '../db/schema.js';
import type { JobType } from '../../domain/types/common.types.js';

export interface QueueJob {
  id: string;
  type: JobType;
  objectId: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  nextRetryAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class QueueRepository {
  constructor(private readonly db: Db) {}

  async enqueue(type: JobType, objectId: string): Promise<QueueJob> {
    const id = randomUUID();
    const now = new Date();
    const [row] = await this.db.insert(jobs).values({
      id,
      type,
      objectId,
      status: 'pending',
      attempts: 0,
      maxAttempts: 3,
      nextRetryAt: now,
      createdAt: now,
      updatedAt: now,
    }).returning();
    return this.toJob(row);
  }

  async dequeue(): Promise<QueueJob | null> {
    const now = new Date();
    const result = await this.db.execute(sql`
      UPDATE jobs SET status = 'processing', updated_at = ${now}
      WHERE id = (
        SELECT id FROM jobs
        WHERE status = 'pending'
          AND (next_retry_at IS NULL OR next_retry_at <= ${now})
        ORDER BY created_at
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *
    `);
    const rows = result as unknown as Array<Record<string, unknown>>;
    if (rows.length === 0) return null;
    return this.toJobFromRaw(rows[0]);
  }

  async complete(jobId: string): Promise<void> {
    await this.db.update(jobs)
      .set({ status: 'completed', updatedAt: new Date() })
      .where(eq(jobs.id, jobId));
  }

  async fail(jobId: string, error: string, errorCode: string): Promise<{ sentToDlq: boolean }> {
    const [row] = await this.db.update(jobs)
      .set({
        attempts: sql`${jobs.attempts} + 1`,
        lastError: `${errorCode}: ${error}`,
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, jobId))
      .returning();

    if (row.attempts >= row.maxAttempts) {
      await this.db.update(jobs)
        .set({ status: 'failed', updatedAt: new Date() })
        .where(eq(jobs.id, jobId));
      return { sentToDlq: true };
    }

    // Exponential backoff: 2^(attempt+1) seconds
    const delayMs = Math.pow(2, row.attempts + 1) * 1000;
    const nextRetry = new Date(Date.now() + delayMs);
    await this.db.update(jobs)
      .set({ status: 'pending', nextRetryAt: nextRetry, updatedAt: new Date() })
      .where(eq(jobs.id, jobId));
    return { sentToDlq: false };
  }

  async size(): Promise<number> {
    const result = await this.db.select({ count: sql<number>`count(*)::int` })
      .from(jobs)
      .where(
        sql`${jobs.status} IN ('pending', 'processing')`,
      );
    return result[0].count;
  }

  async recoverStale(staleSec: number = 60): Promise<number> {
    const cutoff = new Date(Date.now() - staleSec * 1000);
    const result = await this.db.update(jobs)
      .set({ status: 'pending', updatedAt: new Date() })
      .where(
        and(
          eq(jobs.status, 'processing'),
          lte(jobs.updatedAt, cutoff),
        ),
      )
      .returning();
    return result.length;
  }

  private toJob(row: typeof jobs.$inferSelect): QueueJob {
    return {
      id: row.id,
      type: row.type as JobType,
      objectId: row.objectId,
      status: row.status,
      attempts: row.attempts,
      maxAttempts: row.maxAttempts,
      lastError: row.lastError,
      nextRetryAt: row.nextRetryAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private toJobFromRaw(row: Record<string, unknown>): QueueJob {
    return {
      id: String(row.id),
      type: String(row.type) as JobType,
      objectId: String(row.object_id),
      status: String(row.status),
      attempts: Number(row.attempts),
      maxAttempts: Number(row.max_attempts),
      lastError: row.last_error ? String(row.last_error) : null,
      nextRetryAt: row.next_retry_at ? new Date(String(row.next_retry_at)) : null,
      createdAt: new Date(String(row.created_at)),
      updatedAt: new Date(String(row.updated_at)),
    };
  }
}
