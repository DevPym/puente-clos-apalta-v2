import { createContainer } from './container.js';
import { runMigrations } from './shared/db/migrate.js';
import { createServer, startServer } from './infrastructure/http/server.js';

async function main() {
  const container = createContainer();
  const { logger, config, db, queue, dlq, worker, dbClose } = container;

  logger.info('Starting Puente Clos Apalta v2');

  // Run database migrations
  await runMigrations(db, logger);

  // Recover any stale jobs from previous crash
  const recovered = await queue.recoverStale();
  if (recovered > 0) {
    logger.info('Recovered stale jobs', { count: recovered });
  }

  // Create and start HTTP server
  const app = createServer({
    logger,
    queue,
    dlq,
    hubspotClientSecret: config.HUBSPOT_CLIENT_SECRET,
  });
  startServer(app, config.PORT, logger);

  // Start queue worker
  worker.start();

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down...');
    worker.stop();
    await dbClose();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
