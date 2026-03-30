import type { HsDeal } from '../../domain/types/hubspot.types.js';
import type { OracleReservation, ReservationGuest, OracleResStatus } from '../../domain/types/oracle.types.js';
import { RoomTypeMap, RatePlanMap, PaymentMethodMap } from '../../domain/types/mappings.js';
import {
  mapReservationStatus,
  parseNumberFromString,
} from '../../domain/rules/company.rules.js';

export interface DealMapperInput {
  deal: HsDeal;
  guestProfiles: ReservationGuest[];
  travelAgentId?: string;
}

/**
 * Maps HsDeal → OracleReservation.
 * Solo 8 propiedades del deal se sincronizan (según export HubSpot 2026-03-30).
 * sourceCode siempre es 'HS' (fuente_de_reserva fue removida del deal).
 * numberOfRooms siempre es 1, isPseudoRoom siempre false.
 */
export function mapHsDealToReservation(input: DealMapperInput): OracleReservation {
  const { deal, guestProfiles, travelAgentId } = input;

  const roomType = RoomTypeMap[deal.room_type];
  if (!roomType) {
    throw new Error(`Unknown room_type: "${deal.room_type}". Valid: ${Object.keys(RoomTypeMap).join(', ')}`);
  }

  const ratePlanCode = RatePlanMap[deal.tipo_de_tarifa];
  if (!ratePlanCode) {
    throw new Error(`Unknown tipo_de_tarifa: "${deal.tipo_de_tarifa}". Valid: ${Object.keys(RatePlanMap).join(', ')}`);
  }

  const reservationStatus: OracleResStatus = mapReservationStatus(deal.estado_de_reserva);

  let paymentMethod: string | undefined;
  if (deal.tipo_de_pago) {
    const hsKey = deal.tipo_de_pago;
    if (hsKey in PaymentMethodMap) {
      const mapped = PaymentMethodMap[hsKey];
      if (mapped !== null) paymentMethod = mapped;
    }
  }

  const reservation: OracleReservation = {
    arrivalDate: deal.check_in,
    departureDate: deal.check_out,
    roomType,
    ratePlanCode,
    adults: parseNumberFromString(deal.n_huespedes) ?? 1,
    children: parseNumberFromString(deal.n_ninosas) ?? 0,
    numberOfRooms: 1,
    guestProfiles,
    sourceCode: 'HS',
    sourceType: 'PMS',
    reservationStatus,
    isPseudoRoom: false,
    currencyCode: 'CLP',
  };

  if (travelAgentId) reservation.travelAgentId = travelAgentId;
  if (paymentMethod) reservation.paymentMethod = paymentMethod;

  return reservation;
}
