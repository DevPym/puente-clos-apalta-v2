import { eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { deadLetterJobs } from '../db/schema.js';
import type { JobType } from '../../domain/types/common.types.js';

export interface DlqEntry {
  id: string;
  jobType: string;
  objectId: string;
  payload: unknown;
  errorCode: string;
  firstError: string;
  lastError: string;
  attempts: number;
  status: string;
  createdAt: Date;
  failedAt: Date;
  resolvedAt: Date | null;
  resolvedBy: string | null;
}

export interface NewDlqEntry {
  id: string;
  jobType: string;
  objectId: string;
  payload: Record<string, unknown>;
  errorCode: string;
  firstError: string;
  lastError: string;
  attempts: number;
  createdAt: Date;
  failedAt: Date;
}

export class DlqRepository {
  constructor(private readonly db: Db) {}

  async insert(entry: NewDlqEntry): Promise<void> {
    await this.db.insert(deadLetterJobs).values({
      id: entry.id,
      jobType: entry.jobType,
      objectId: entry.objectId,
      payload: entry.payload,
      errorCode: entry.errorCode,
      firstError: entry.firstError,
      lastError: entry.lastError,
      attempts: entry.attempts,
      status: 'pending',
      createdAt: entry.createdAt,
      failedAt: entry.failedAt,
    });
  }

  async findPending(): Promise<DlqEntry[]> {
    const rows = await this.db.select().from(deadLetterJobs)
      .where(eq(deadLetterJobs.status, 'pending'))
      .orderBy(deadLetterJobs.createdAt);
    return rows.map(this.toEntry);
  }

  async findByObjectId(objectId: string): Promise<DlqEntry[]> {
    const rows = await this.db.select().from(deadLetterJobs)
      .where(eq(deadLetterJobs.objectId, objectId))
      .orderBy(deadLetterJobs.createdAt);
    return rows.map(this.toEntry);
  }

  async findByJobType(jobType: JobType): Promise<DlqEntry[]> {
    const rows = await this.db.select().from(deadLetterJobs)
      .where(eq(deadLetterJobs.jobType, jobType))
      .orderBy(deadLetterJobs.createdAt);
    return rows.map(this.toEntry);
  }

  async markResolved(jobId: string, resolvedBy: string): Promise<void> {
    await this.db.update(deadLetterJobs).set({
      status: 'resolved',
      resolvedAt: new Date(),
      resolvedBy,
    }).where(eq(deadLetterJobs.id, jobId));
  }

  async markIgnored(jobId: string): Promise<void> {
    await this.db.update(deadLetterJobs).set({
      status: 'ignored',
      resolvedAt: new Date(),
    }).where(eq(deadLetterJobs.id, jobId));
  }

  async countPending(): Promise<number> {
    const result = await this.db.select({ count: sql<number>`count(*)::int` })
      .from(deadLetterJobs)
      .where(eq(deadLetterJobs.status, 'pending'));
    return result[0].count;
  }

  async getStats(): Promise<{ pending: number; resolved: number; ignored: number }> {
    const result = await this.db.select({
      status: deadLetterJobs.status,
      count: sql<number>`count(*)::int`,
    })
      .from(deadLetterJobs)
      .groupBy(deadLetterJobs.status);

    const stats = { pending: 0, resolved: 0, ignored: 0 };
    for (const row of result) {
      if (row.status === 'pending') stats.pending = row.count;
      if (row.status === 'resolved') stats.resolved = row.count;
      if (row.status === 'ignored') stats.ignored = row.count;
    }
    return stats;
  }

  private toEntry(row: typeof deadLetterJobs.$inferSelect): DlqEntry {
    return {
      id: row.id,
      jobType: row.jobType,
      objectId: row.objectId,
      payload: row.payload,
      errorCode: row.errorCode,
      firstError: row.firstError,
      lastError: row.lastError,
      attempts: row.attempts,
      status: row.status,
      createdAt: row.createdAt,
      failedAt: row.failedAt,
      resolvedAt: row.resolvedAt,
      resolvedBy: row.resolvedBy,
    };
  }
}
