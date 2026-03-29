import type { IOracleClient } from './domain/ports/oracle.port.js';
import type { IHubSpotClient } from './domain/ports/hubspot.port.js';
import type { ILogger } from './shared/logger/logger.js';
import type { AppConfig } from './shared/config/env.js';
import { createLogger } from './shared/logger/logger.js';
import { config } from './shared/config/env.js';
import { OracleAuth } from './infrastructure/oracle/oracle.auth.js';
import { OracleClient } from './infrastructure/oracle/oracle.client.js';
import { HubSpotClient } from './infrastructure/hubspot/hubspot.client.js';

export interface Container {
  oracle: IOracleClient;
  hubspot: IHubSpotClient;
  logger: ILogger;
  config: AppConfig;
}

export function createContainer(): Container {
  const logger = createLogger(config.NODE_ENV);

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

  const hubspot = new HubSpotClient(
    { accessToken: config.HUBSPOT_ACCESS_TOKEN },
    logger,
  );

  return { oracle, hubspot, logger, config };
}
