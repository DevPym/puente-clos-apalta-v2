import type { ILogger } from './shared/logger/logger.js';
import type { AppConfig } from './shared/config/env.js';
import { createLogger } from './shared/logger/logger.js';
import { config } from './shared/config/env.js';

export interface Container {
  logger: ILogger;
  config: AppConfig;
}

export function createContainer(): Container {
  const logger = createLogger(config.NODE_ENV);
  return { logger, config };
}
