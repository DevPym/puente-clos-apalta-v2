import type { HsDeal } from '../../domain/types/hubspot.types.js';
import type { OracleReservation, ReservationGuest, OracleResStatus } from '../../domain/types/oracle.types.js';
import { RoomTypeMap, RatePlanMap, PaymentMethodMap } from '../../domain/types/mappings.js';
import {
  mapReservationStatus,
  parseSourceCode,
  parseNumberFromString,
} from '../../domain/rules/company.rules.js';

export interface DealMapperInput {
  deal: HsDeal;
  guestProfiles: ReservationGuest[];
  travelAgentId?: string;
}

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

  let sourceCode = 'HS';
  if (deal.fuente_de_reserva) {
    sourceCode = parseSourceCode(deal.fuente_de_reserva);
  }

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
    numberOfRooms: parseNumberFromString(deal.cantidad_de_habitaciones) ?? 1,
    guestProfiles,
    sourceCode,
    sourceType: 'PMS',
    reservationStatus,
    isPseudoRoom: deal.es_pseudo_room === 'true',
    currencyCode: 'CLP',
  };

  if (deal.n_habitacion) reservation.roomId = deal.n_habitacion;
  if (travelAgentId) reservation.travelAgentId = travelAgentId;
  if (paymentMethod) reservation.paymentMethod = paymentMethod;
  if (deal.comentarios_del_huesped) reservation.comments = deal.comentarios_del_huesped;

  return reservation;
}
