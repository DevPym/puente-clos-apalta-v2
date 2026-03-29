import { eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { syncLogs } from '../db/schema.js';
import type { JobType } from '../../domain/types/common.types.js';

export interface SyncLogEntry {
  id: number;
  jobId: string | null;
  jobType: string;
  objectId: string;
  oracleId: string | null;
  direction: string;
  status: string;
  errorCode: string | null;
  errorMessage: string | null;
  durationMs: number | null;
  metadata: unknown;
  createdAt: Date;
}

export interface NewSyncLog {
  jobId: string | null;
  jobType: string;
  objectId: string;
  oracleId: string | null;
  direction: string;
  status: string;
  errorCode: string | null;
  errorMessage: string | null;
  durationMs: number | null;
  metadata: unknown;
}

export class SyncLogRepository {
  constructor(private readonly db: Db) {}

  async log(entry: NewSyncLog): Promise<void> {
    await this.db.insert(syncLogs).values({
      jobId: entry.jobId,
      jobType: entry.jobType,
      objectId: entry.objectId,
      oracleId: entry.oracleId,
      direction: entry.direction,
      status: entry.status,
      errorCode: entry.errorCode,
      errorMessage: entry.errorMessage,
      durationMs: entry.durationMs,
      metadata: entry.metadata,
    });
  }

  async findByObjectId(objectId: string): Promise<SyncLogEntry[]> {
    const rows = await this.db.select().from(syncLogs)
      .where(eq(syncLogs.objectId, objectId))
      .orderBy(syncLogs.createdAt);
    return rows as SyncLogEntry[];
  }

  async getErrorStats(since: Date): Promise<Array<{ errorCode: string; count: number }>> {
    const rows = await this.db.select({
      errorCode: syncLogs.errorCode,
      count: sql<number>`count(*)::int`,
    })
      .from(syncLogs)
      .where(sql`${syncLogs.status} = 'error' AND ${syncLogs.createdAt} >= ${since}`)
      .groupBy(syncLogs.errorCode);

    return rows.map((r) => ({
      errorCode: r.errorCode ?? 'UNKNOWN',
      count: r.count,
    }));
  }

  async getAvgLatency(jobType: JobType): Promise<number> {
    const result = await this.db.select({
      avg: sql<number>`coalesce(avg(${syncLogs.durationMs}), 0)::int`,
    })
      .from(syncLogs)
      .where(sql`${syncLogs.jobType} = ${jobType} AND ${syncLogs.status} = 'success'`);
    return result[0].avg;
  }
}
