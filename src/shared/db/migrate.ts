import { migrate } from 'drizzle-orm/postgres-js/migrator';
import type { Db } from './client.js';
import type { ILogger } from '../logger/logger.js';

export async function runMigrations(db: Db, logger: ILogger): Promise<void> {
  logger.info('Running database migrations');
  await migrate(db, { migrationsFolder: './drizzle' });
  logger.info('Database migrations complete');
}
