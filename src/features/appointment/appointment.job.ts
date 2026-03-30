import type { IOracleClient } from '../../domain/ports/oracle.port.js';
import type { IHubSpotClient } from '../../domain/ports/hubspot.port.js';
import type { ILogger } from '../../shared/logger/logger.js';
import { mapHsAppointmentToOracle } from './appointment.mapper.js';

export interface AppointmentJobDeps {
  oracle: IOracleClient;
  hubspot: IHubSpotClient;
  logger: ILogger;
  hotelId: string;
}

/**
 * Procesa un appointment (registro diario de huésped).
 *
 * Flujo:
 *   1. Fetch del appointment desde HubSpot (objectType 0-421)
 *   2. Buscar el Deal asociado para obtener el Oracle reservation ID
 *   3. Buscar el Contact del deal para obtener el Oracle profile ID
 *   4. Mapear las propiedades a 4 APIs de Oracle (messages, service requests, billing, activities)
 *   5. Enviar a Oracle
 */
export async function processAppointment(
  deps: AppointmentJobDeps,
  payload: { objectId: string },
): Promise<{ oracleId?: string }> {
  const { oracle, hubspot, logger, hotelId } = deps;

  // 1. Fetch del appointment real desde HubSpot
  const appointmentResult = await hubspot.getAppointmentById(payload.objectId);
  if (!appointmentResult.ok) throw appointmentResult.error;
  const appointment = appointmentResult.data;

  // 2. Buscar el Deal asociado al appointment
  const dealIdResult = await hubspot.getAssociatedDealForAppointment(payload.objectId);
  if (!dealIdResult.ok) throw dealIdResult.error;

  if (!dealIdResult.data) {
    logger.warn('Appointment has no associated deal, skipping', { objectId: payload.objectId });
    return {};
  }

  const dealId = dealIdResult.data;
  const dealResult = await hubspot.getDealById(dealId);
  if (!dealResult.ok) throw dealResult.error;

  const deal = dealResult.data;
  if (!deal.id_oracle) {
    throw new Error(`Deal ${dealId} has no Oracle reservation ID. Sync deal first.`);
  }

  // 3. Buscar el Contact del deal para obtener el Oracle profile ID
  const contactsResult = await hubspot.getAssociatedContacts(dealId);
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
    throw new Error(`No contact with Oracle profile ID found for deal ${dealId}`);
  }

  // 4. Mapear a Oracle API payloads
  const mapped = mapHsAppointmentToOracle(appointment, {
    reservationId: deal.id_oracle,
    profileId,
    hotelId,
  });

  // 5. Enviar a Oracle (4 API types)
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

  for (const activity of mapped.activities) {
    const result = await oracle.createActivityBooking(activity);
    if (!result.ok) throw result.error;
  }

  logger.info('Processed appointment', {
    objectId: payload.objectId,
    dealId,
    oracleReservationId: deal.id_oracle,
    messages: mapped.messages.length,
    serviceRequests: mapped.serviceRequests.length,
    billingCharges: mapped.billingCharges.length,
    activities: mapped.activities.length,
  });

  return { oracleId: deal.id_oracle };
}
