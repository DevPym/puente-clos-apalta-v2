import type { IOracleClient } from './domain/ports/oracle.port.js';
import type { IHubSpotClient } from './domain/ports/hubspot.port.js';
import type { ILogger } from './shared/logger/logger.js';
import type { AppConfig } from './shared/config/env.js';
import { createLogger } from './shared/logger/logger.js';
import { config } from './shared/config/env.js';
import { OracleAuth } from './infrastructure/oracle/oracle.auth.js';
import { OracleClient } from './infrastructure/oracle/oracle.client.js';
import { HubSpotClient } from './infrastructure/hubspot/hubspot.client.js';
import { createDb } from './shared/db/client.js';
import type { Db } from './shared/db/client.js';
import { QueueRepository } from './shared/queue/queue.repository.js';
import { DlqRepository } from './shared/dlq/dlq.repository.js';
import { SyncLogRepository } from './shared/logger/sync-log.repository.js';
import { Worker } from './shared/queue/worker.js';
import { processContact } from './features/contact/contact.job.js';
import { processCompany } from './features/company/company.job.js';
import { processDeal } from './features/deal/deal.job.js';
import { cancelDeal } from './features/deal/deal.cancel.js';

export interface Container {
  oracle: IOracleClient;
  hubspot: IHubSpotClient;
  logger: ILogger;
  config: AppConfig;
  db: Db;
  queue: QueueRepository;
  dlq: DlqRepository;
  syncLog: SyncLogRepository;
  worker: Worker;
  dbClose: () => Promise<void>;
}

export function createContainer(): Container {
  const logger = createLogger(config.NODE_ENV);

  // Database
  const { db, sql: pgSql } = createDb(config.DATABASE_URL);

  // Repositories
  const queue = new QueueRepository(db);
  const dlq = new DlqRepository(db);
  const syncLog = new SyncLogRepository(db);

  // Oracle
  const oracleAuth = new OracleAuth(
    {
      baseUrl: config.ORACLE_BASE_URL,
      clientId: config.ORACLE_CLIENT_ID,
      clientSecret: config.ORACLE_CLIENT_SECRET,
    },
    logger,
  );

  const oracle = new OracleClient(
    {
      baseUrl: config.ORACLE_BASE_URL,
      hotelId: config.ORACLE_HOTEL_ID,
      appKey: config.ORACLE_APP_KEY,
      externalSystem: config.ORACLE_EXTERNAL_SYSTEM,
    },
    oracleAuth,
    logger,
  );

  // HubSpot
  const hubspot = new HubSpotClient(
    { accessToken: config.HUBSPOT_ACCESS_TOKEN },
    logger,
  );

  // Worker
  const worker = new Worker(queue, dlq, syncLog, logger);
  const jobDeps = { oracle, hubspot, logger };
  const cancelDeps = { ...jobDeps, cancellationReasonCode: config.ORACLE_CANCELLATION_REASON_CODE };

  worker.registerHandler('contact.create', (job) => processContact(jobDeps, { objectId: job.objectId }));
  worker.registerHandler('contact.update', (job) => processContact(jobDeps, { objectId: job.objectId }));
  worker.registerHandler('company.create', (job) => processCompany(jobDeps, { objectId: job.objectId }));
  worker.registerHandler('company.update', (job) => processCompany(jobDeps, { objectId: job.objectId }));
  worker.registerHandler('deal.create', (job) => processDeal(jobDeps, { objectId: job.objectId }));
  worker.registerHandler('deal.update', (job) => processDeal(jobDeps, { objectId: job.objectId }));
  worker.registerHandler('deal.delete', (job) => cancelDeal(cancelDeps, { objectId: job.objectId }));

  const dbClose = async () => {
    await pgSql.end();
  };

  return { oracle, hubspot, logger, config, db, queue, dlq, syncLog, worker, dbClose };
}
