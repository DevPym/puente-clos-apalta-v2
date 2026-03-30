import type { IOracleClient } from '../../domain/ports/oracle.port.js';
import type { IHubSpotClient } from '../../domain/ports/hubspot.port.js';
import type { ILogger } from '../../shared/logger/logger.js';
import type { ReservationGuest } from '../../domain/types/oracle.types.js';
import { isPrimaryGuest } from '../../domain/rules/company.rules.js';
import { mapHsDealToReservation } from './deal.mapper.js';

export interface DealJobDeps {
  oracle: IOracleClient;
  hubspot: IHubSpotClient;
  logger: ILogger;
}

export async function processDeal(
  deps: DealJobDeps,
  payload: { objectId: string },
): Promise<{ oracleId?: string }> {
  const { oracle, hubspot, logger } = deps;

  // 1. Get deal from HubSpot
  const dealResult = await hubspot.getDealById(payload.objectId);
  if (!dealResult.ok) throw dealResult.error;
  const deal = dealResult.data;

  // 2. Get associated contacts and resolve Oracle profile IDs
  const contactsResult = await hubspot.getAssociatedContacts(payload.objectId);
  if (!contactsResult.ok) throw contactsResult.error;

  if (contactsResult.data.length === 0) {
    throw new Error('Deal has no associated contacts');
  }

  const guestProfiles: ReservationGuest[] = [];
  for (const assoc of contactsResult.data) {
    const contactResult = await hubspot.getContactById(assoc.contactId);
    if (!contactResult.ok) throw contactResult.error;

    const contact = contactResult.data;
    if (!contact.id_oracle) {
      throw new Error(`Contact ${assoc.contactId} has no Oracle profile ID. Sync contact first.`);
    }

    guestProfiles.push({
      oracleProfileId: contact.id_oracle,
      isPrimary: isPrimaryGuest(assoc.labels),
    });
  }

  // Ensure at least one primary guest
  if (!guestProfiles.some((g) => g.isPrimary) && guestProfiles.length > 0) {
    guestProfiles[0].isPrimary = true;
  }

  // 3. Get associated company (travel agent) if any
  let travelAgentId: string | undefined;
  const companyResult = await hubspot.getCompanyByDealId(payload.objectId);
  if (companyResult.ok && companyResult.data?.id_oracle) {
    travelAgentId = companyResult.data.id_oracle;
  }

  // 4. Map and send to Oracle
  const reservation = mapHsDealToReservation({ deal, guestProfiles, travelAgentId });

  let oracleResId: string;

  if (deal.id_oracle) {
    // Update existing reservation
    const updateResult = await oracle.updateReservation(deal.id_oracle, reservation);
    if (!updateResult.ok) throw updateResult.error;
    oracleResId = deal.id_oracle;
    logger.info('Updated Oracle reservation', { objectId: payload.objectId, oracleId: oracleResId });
  } else {
    // Create new reservation
    const createResult = await oracle.createReservation(reservation);
    if (!createResult.ok) throw createResult.error;

    const ids = createResult.data;
    oracleResId = ids.internalId;

    // 5. Write back Oracle IDs to HubSpot
    const writebackResult = await hubspot.updateDeal(payload.objectId, {
      id_oracle: ids.internalId,
      'numero_de_reserva_': ids.confirmationId ?? null,
      confirmation_number__oracle: ids.confirmationId ?? null,
    });
    if (!writebackResult.ok) {
      logger.error(`Failed to write Oracle IDs back to HubSpot deal ${payload.objectId}: ${writebackResult.error.code} — ${writebackResult.error.message}`);
    }

    logger.info('Created Oracle reservation', {
      objectId: payload.objectId,
      oracleId: ids.internalId,
      confirmationId: ids.confirmationId,
    });
  }

  // 6. Associate TravelAgent via Front Desk API (separate from reservation POST/PUT)
  if (travelAgentId) {
    const agentResult = await oracle.associateTravelAgent(oracleResId, travelAgentId);
    if (!agentResult.ok) {
      // Non-fatal: log but don't throw — reservation was already created successfully
      logger.error(`Failed to associate TravelAgent ${travelAgentId} to reservation ${oracleResId}: ${agentResult.error.message}`);
    } else {
      logger.info('Associated TravelAgent to reservation', { oracleResId, travelAgentId });
    }
  }

  return { oracleId: oracleResId };
}
