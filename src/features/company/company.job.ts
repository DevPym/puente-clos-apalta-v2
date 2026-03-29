import type { IOracleClient } from '../../domain/ports/oracle.port.js';
import type { IHubSpotClient } from '../../domain/ports/hubspot.port.js';
import type { ILogger } from '../../shared/logger/logger.js';
import { mapHsCompanyToOracleProfile } from './company.mapper.js';

export interface CompanyJobDeps {
  oracle: IOracleClient;
  hubspot: IHubSpotClient;
  logger: ILogger;
}

export async function processCompany(
  deps: CompanyJobDeps,
  payload: { objectId: string },
): Promise<{ oracleId?: string }> {
  const { oracle, hubspot, logger } = deps;

  const companyResult = await hubspot.getCompanyById(payload.objectId);
  if (!companyResult.ok) throw companyResult.error;

  const company = companyResult.data;

  if (!company.name) {
    logger.warn('Company has no name, skipping', { objectId: payload.objectId });
    return {};
  }

  const profile = mapHsCompanyToOracleProfile(company);

  if (company.id_oracle) {
    const updateResult = await oracle.updateCompanyProfile(company.id_oracle, profile);
    if (!updateResult.ok) throw updateResult.error;
    logger.info('Updated Oracle company profile', { objectId: payload.objectId, oracleId: company.id_oracle });
    return { oracleId: company.id_oracle };
  }

  const createResult = await oracle.createCompanyProfile(profile);
  if (!createResult.ok) throw createResult.error;

  const oracleId = createResult.data;

  const writebackResult = await hubspot.updateCompany(payload.objectId, { id_oracle: oracleId });
  if (!writebackResult.ok) {
    logger.error('Failed to write Oracle ID back to HubSpot company', {
      objectId: payload.objectId,
      oracleId,
      error: writebackResult.error.message,
    });
  }

  logger.info('Created Oracle company profile', { objectId: payload.objectId, oracleId, profileType: profile.profileType });
  return { oracleId };
}
