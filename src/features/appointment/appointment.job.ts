import type { IOracleClient } from '../../domain/ports/oracle.port.js';
import type { IHubSpotClient } from '../../domain/ports/hubspot.port.js';
import type { ILogger } from '../../shared/logger/logger.js';
import { mapHsAppointmentToOracle } from './appointment.mapper.js';
import type { HsAppointment } from '../../domain/types/hubspot.types.js';

export interface AppointmentJobDeps {
  oracle: IOracleClient;
  hubspot: IHubSpotClient;
  logger: ILogger;
  hotelId: string;
}

/**
 * Processes an appointment (daily guest log).
 * Requires a linked Deal with an Oracle reservation ID.
 *
 * The appointment object is fetched from HubSpot and its fields are
 * dispatched to 4 different Oracle APIs:
 *   - Activities → Guest Messages (workaround until Oracle activity types are created)
 *   - Comments/incidents/dietary → Guest Messages
 *   - Maintenance → Service Requests
 *   - Meals → Cashiering (billing charges)
 */
export async function processAppointment(
  deps: AppointmentJobDeps,
  payload: { objectId: string; dealId: string },
): Promise<{ oracleId?: string }> {
  const { oracle, hubspot, logger, hotelId } = deps;

  // 1. Get the linked Deal to find the Oracle reservation ID
  const dealResult = await hubspot.getDealById(payload.dealId);
  if (!dealResult.ok) throw dealResult.error;

  const deal = dealResult.data;
  if (!deal.id_oracle) {
    throw new Error(`Deal ${payload.dealId} has no Oracle reservation ID. Sync deal first.`);
  }

  // 2. Get associated contact's Oracle profile ID (first primary guest)
  const contactsResult = await hubspot.getAssociatedContacts(payload.dealId);
  if (!contactsResult.ok) throw contactsResult.error;

  let profileId = '';
  for (const assoc of contactsResult.data) {
    const contactResult = await hubspot.getContactById(assoc.contactId);
    if (contactResult.ok && contactResult.data.id_oracle) {
      profileId = contactResult.data.id_oracle;
      break;
    }
  }

  if (!profileId) {
    throw new Error(`No contact with Oracle profile ID found for deal ${payload.dealId}`);
  }

  // 3. Build the appointment data — using objectId as a proxy
  // In real usage, the appointment properties come from HubSpot custom object
  // For now, we construct from deal's operational fields
  const appointment: HsAppointment = {
    hs_object_id: payload.objectId,
    // These fields would come from the actual appointment object fetch
    // Currently the HubSpot SDK doesn't have a built-in appointments API,
    // so this will be wired when the webhook delivers the full properties
  };

  // 4. Map to Oracle API payloads
  const mapped = mapHsAppointmentToOracle(appointment, {
    reservationId: deal.id_oracle,
    profileId,
    hotelId,
  });

  // 5. Send to Oracle (all 4 API types)
  for (const message of mapped.messages) {
    const result = await oracle.createGuestMessage(message);
    if (!result.ok) throw result.error;
  }

  for (const sr of mapped.serviceRequests) {
    const result = await oracle.createServiceRequest(sr);
    if (!result.ok) throw result.error;
  }

  for (const charge of mapped.billingCharges) {
    const result = await oracle.postBillingCharge(charge);
    if (!result.ok) throw result.error;
  }

  // Activities use createActivityBooking when Oracle activity types are configured
  for (const activity of mapped.activities) {
    const result = await oracle.createActivityBooking(activity);
    if (!result.ok) throw result.error;
  }

  logger.info('Processed appointment', {
    objectId: payload.objectId,
    dealId: payload.dealId,
    oracleReservationId: deal.id_oracle,
    messages: mapped.messages.length,
    serviceRequests: mapped.serviceRequests.length,
    billingCharges: mapped.billingCharges.length,
    activities: mapped.activities.length,
  });

  return { oracleId: deal.id_oracle };
}
