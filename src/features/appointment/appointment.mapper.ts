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
 * Maps an HsAppointment (28 campos según export HubSpot 2026-03-30) to 4 types
 * of Oracle API payloads.
 *
 * Note: Activity types are NOT yet configured in Oracle Back Office.
 * Workaround: pending/completed activities are sent as Guest Messages.
 * Dietary preferences LOV y Service Request codes: 0 configurados en Oracle.
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

  // ── Comments, incidents & mood → Guest Messages ──
  if (appointment.comentarios_del_huesped) {
    messages.push({
      messageText: appointment.comentarios_del_huesped,
      messageType: 'Text',
      reservationId: ctx.reservationId,
      hotelId: ctx.hotelId,
    });
  }

  if (appointment.descripcion_de_la_incidencia) {
    const parts = [`Incidencia: ${appointment.descripcion_de_la_incidencia}`];
    if (appointment.tipo_de_incidencia) parts.push(`Tipo: ${appointment.tipo_de_incidencia}`);
    if (appointment.estado_incidencia) parts.push(`Estado: ${appointment.estado_incidencia}`);
    if (appointment.responsable_asignado) parts.push(`Responsable: ${appointment.responsable_asignado}`);
    messages.push({
      messageText: parts.join(' | '),
      messageType: 'Text',
      reservationId: ctx.reservationId,
      hotelId: ctx.hotelId,
    });
  }

  if (appointment.cambios_dieteticos) {
    messages.push({
      messageText: `Cambio dietético: ${appointment.cambios_dieteticos}`,
      messageType: 'Text',
      reservationId: ctx.reservationId,
      hotelId: ctx.hotelId,
    });
  }

  if (appointment.estado_de_animo_general) {
    messages.push({
      messageText: `Estado de ánimo: ${appointment.estado_de_animo_general}`,
      messageType: 'Text',
      reservationId: ctx.reservationId,
      hotelId: ctx.hotelId,
    });
  }

  if (appointment.feedback_espontaneo) {
    messages.push({
      messageText: `Feedback: ${appointment.feedback_espontaneo}`,
      messageType: 'Text',
      reservationId: ctx.reservationId,
      hotelId: ctx.hotelId,
    });
  }

  if (appointment.observaciones_de_mejora) {
    messages.push({
      messageText: `Observación de mejora: ${appointment.observaciones_de_mejora}`,
      messageType: 'Text',
      reservationId: ctx.reservationId,
      hotelId: ctx.hotelId,
    });
  }

  if (appointment.servicios_utilizados) {
    messages.push({
      messageText: `Servicios utilizados: ${appointment.servicios_utilizados}`,
      messageType: 'Text',
      reservationId: ctx.reservationId,
      hotelId: ctx.hotelId,
    });
  }

  if (appointment.nivel_de_satisfaccion_actividades) {
    messages.push({
      messageText: `Satisfacción actividades: ${appointment.nivel_de_satisfaccion_actividades}/10`,
      messageType: 'Text',
      reservationId: ctx.reservationId,
      hotelId: ctx.hotelId,
    });
  }

  if (appointment.preferencia_de_horario) {
    messages.push({
      messageText: `Preferencia horario: ${appointment.preferencia_de_horario}`,
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

  if (appointment.observaciones_de_la_habitacion) {
    serviceRequests.push({
      description: `Observación habitación: ${appointment.observaciones_de_la_habitacion}`,
      reservationId: ctx.reservationId,
      hotelId: ctx.hotelId,
    });
  }

  // Housekeeping → Service Request con detalle de tareas
  if (appointment.tareas_realizadas || appointment.nombre_housekeeping || appointment.velocidad_del_servicio) {
    const parts: string[] = ['Housekeeping'];
    if (appointment.nombre_housekeeping) parts.push(`Responsable: ${appointment.nombre_housekeeping}`);
    if (appointment.tareas_realizadas) parts.push(`Tareas: ${appointment.tareas_realizadas}`);
    if (appointment.velocidad_del_servicio) parts.push(`Velocidad: ${appointment.velocidad_del_servicio}`);
    serviceRequests.push({
      description: parts.join(' | '),
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

  if (appointment.snacks__bebidas_adicionales) {
    billingCharges.push({
      transactionCode: MealTransactionCodeMap.snacks,
      description: appointment.snacks__bebidas_adicionales,
      reservationId: ctx.reservationId,
      hotelId: ctx.hotelId,
    });
  }

  if (appointment.gastos_adicionales_del_dia) {
    billingCharges.push({
      transactionCode: MealTransactionCodeMap.extras,
      description: `Gastos adicionales: ${appointment.gastos_adicionales_del_dia}`,
      reservationId: ctx.reservationId,
      hotelId: ctx.hotelId,
    });
  }

  if (appointment.tienda_le_club) {
    billingCharges.push({
      transactionCode: MealTransactionCodeMap.shop,
      description: `Tienda Le Club: ${appointment.tienda_le_club}`,
      reservationId: ctx.reservationId,
      hotelId: ctx.hotelId,
    });
  }

  return { activities, messages, serviceRequests, billingCharges };
}
