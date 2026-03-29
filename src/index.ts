import { createContainer } from './container.js';
import { createServer, startServer } from './infrastructure/http/server.js';

const container = createContainer();
const { logger, config } = container;

logger.info('Starting Puente Clos Apalta v2');

const app = createServer(logger);
startServer(app, config.PORT, logger);
