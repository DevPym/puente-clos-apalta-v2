import type { HsAppointment } from '../../domain/types/hubspot.types.js';
import type {
  OracleActivityBooking,
  OracleGuestMessage,
  OracleServiceRequest,
  OracleBillingCharge,
} from '../../domain/types/oracle.types.js';
import { MealTransactionCodeMap } from '../../domain/types/mappings.js';

export interface AppointmentContext {
  reservationId: string;
  profileId: string;
  hotelId: string;
}

export interface MappedAppointment {
  activities: OracleActivityBooking[];
  messages: OracleGuestMessage[];
  serviceRequests: OracleServiceRequest[];
  billingCharges: OracleBillingCharge[];
}

/**
 * Maps an HsAppointment to 4 types of Oracle API payloads.
 *
 * Note: Activity types are NOT yet configured in Oracle Back Office.
 * Workaround: pending/completed activities are sent as Guest Messages
 * with the activity name. When Oracle admin creates the 14 activity types,
 * uncomment the activity booking mapping and use the real codes.
 */
export function mapHsAppointmentToOracle(
  appointment: HsAppointment,
  ctx: AppointmentContext,
): MappedAppointment {
  const activities: OracleActivityBooking[] = [];
  const messages: OracleGuestMessage[] = [];
  const serviceRequests: OracleServiceRequest[] = [];
  const billingCharges: OracleBillingCharge[] = [];

  // ── Activities → Guest Messages (workaround: activity types not in Oracle) ──
  if (appointment.actividades_pendientes_o_reservadas) {
    messages.push({
      messageText: `Actividad reservada: ${appointment.actividades_pendientes_o_reservadas}`,
      messageType: 'Text',
      reservationId: ctx.reservationId,
      hotelId: ctx.hotelId,
    });
  }

  if (appointment.actividades_realizadas) {
    messages.push({
      messageText: `Actividad completada: ${appointment.actividades_realizadas}`,
      messageType: 'Text',
      reservationId: ctx.reservationId,
      hotelId: ctx.hotelId,
    });
  }

  // ── Comments & incidents → Guest Messages ──
  if (appointment.comentarios_del_huesped) {
    messages.push({
      messageText: appointment.comentarios_del_huesped,
      messageType: 'Text',
      reservationId: ctx.reservationId,
      hotelId: ctx.hotelId,
    });
  }

  if (appointment.descripcion_de_la_incidencia) {
    messages.push({
      messageText: `Incidencia: ${appointment.descripcion_de_la_incidencia}`,
      messageType: 'Text',
      reservationId: ctx.reservationId,
      hotelId: ctx.hotelId,
    });
  }

  if (appointment.cambios_dieteticos) {
    // Dietary preferences LOV is empty — send as guest message
    messages.push({
      messageText: `Cambio dietético: ${appointment.cambios_dieteticos}`,
      messageType: 'Text',
      reservationId: ctx.reservationId,
      hotelId: ctx.hotelId,
    });
  }

  // ── Maintenance → Service Requests ──
  if (appointment.comentarios_mantencion) {
    serviceRequests.push({
      description: appointment.comentarios_mantencion,
      reservationId: ctx.reservationId,
      hotelId: ctx.hotelId,
    });
  }

  if (appointment.comentarios_mantencion_habitacion) {
    serviceRequests.push({
      description: `Mantención habitación: ${appointment.comentarios_mantencion_habitacion}`,
      reservationId: ctx.reservationId,
      hotelId: ctx.hotelId,
    });
  }

  // ── Meals → Billing Charges (Cashiering) ──
  if (appointment.descripcion_desayuno_consumido) {
    billingCharges.push({
      transactionCode: MealTransactionCodeMap.breakfast,
      description: appointment.descripcion_desayuno_consumido,
      reservationId: ctx.reservationId,
      hotelId: ctx.hotelId,
    });
  }

  if (appointment.descripcion_almuerzo_consumido) {
    billingCharges.push({
      transactionCode: MealTransactionCodeMap.lunch,
      description: appointment.descripcion_almuerzo_consumido,
      reservationId: ctx.reservationId,
      hotelId: ctx.hotelId,
    });
  }

  if (appointment.descripcion_cena_consumida) {
    billingCharges.push({
      transactionCode: MealTransactionCodeMap.dinner,
      description: appointment.descripcion_cena_consumida,
      reservationId: ctx.reservationId,
      hotelId: ctx.hotelId,
    });
  }

  return { activities, messages, serviceRequests, billingCharges };
}
