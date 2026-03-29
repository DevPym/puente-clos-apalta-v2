import { pgTable, text, integer, timestamp, jsonb, serial, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const jobs = pgTable('jobs', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  objectId: text('object_id').notNull(),
  status: text('status').notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  maxAttempts: integer('max_attempts').notNull().default(3),
  lastError: text('last_error'),
  nextRetryAt: timestamp('next_retry_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('jobs_dedup_idx')
    .on(table.objectId, table.type)
    .where(sql`${table.status} = 'pending'`),
]);

export const deadLetterJobs = pgTable('dead_letter_jobs', {
  id: text('id').primaryKey(),
  jobType: text('job_type').notNull(),
  objectId: text('object_id').notNull(),
  payload: jsonb('payload').notNull(),
  errorCode: text('error_code').notNull(),
  firstError: text('first_error').notNull(),
  lastError: text('last_error').notNull(),
  attempts: integer('attempts').notNull(),
  status: text('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  failedAt: timestamp('failed_at', { withTimezone: true }).notNull(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  resolvedBy: text('resolved_by'),
});

export const syncLogs = pgTable('sync_logs', {
  id: serial('id').primaryKey(),
  jobId: text('job_id'),
  jobType: text('job_type').notNull(),
  objectId: text('object_id').notNull(),
  oracleId: text('oracle_id'),
  direction: text('direction').notNull(),
  status: text('status').notNull(),
  errorCode: text('error_code'),
  errorMessage: text('error_message'),
  durationMs: integer('duration_ms'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
