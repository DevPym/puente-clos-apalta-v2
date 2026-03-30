import type { IOracleClient } from '../../domain/ports/oracle.port.js';
import type { IHubSpotClient } from '../../domain/ports/hubspot.port.js';
import type { ILogger } from '../../shared/logger/logger.js';
import { mapHsContactToGuestProfile } from './contact.mapper.js';

export interface ContactJobDeps {
  oracle: IOracleClient;
  hubspot: IHubSpotClient;
  logger: ILogger;
}

export async function processContact(
  deps: ContactJobDeps,
  payload: { objectId: string },
): Promise<{ oracleId?: string }> {
  const { oracle, hubspot, logger } = deps;

  const contactResult = await hubspot.getContactById(payload.objectId);
  if (!contactResult.ok) throw contactResult.error;

  const contact = contactResult.data;
  const profile = mapHsContactToGuestProfile(contact);

  if (contact.id_oracle) {
    // Update existing profile
    const updateResult = await oracle.updateGuestProfile(contact.id_oracle, profile);
    if (!updateResult.ok) throw updateResult.error;
    logger.info('Updated Oracle guest profile', { objectId: payload.objectId, oracleId: contact.id_oracle });
    return { oracleId: contact.id_oracle };
  }

  // Create new profile
  const createResult = await oracle.createGuestProfile(profile);
  if (!createResult.ok) throw createResult.error;

  const oracleId = createResult.data;

  // Write back Oracle ID to HubSpot
  const writebackResult = await hubspot.updateContact(payload.objectId, { id_oracle: oracleId });
  if (!writebackResult.ok) {
    logger.error(`Failed to write Oracle ID back to HubSpot contact ${payload.objectId}: ${writebackResult.error.code} — ${writebackResult.error.message}`);
  }

  logger.info('Created Oracle guest profile', { objectId: payload.objectId, oracleId });
  return { oracleId };
}
