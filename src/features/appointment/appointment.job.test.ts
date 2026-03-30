import { describe, it, expect, vi } from 'vitest';
import { mapHsAppointmentToOracle } from './appointment.mapper.js';
import type { HsAppointment } from '../../domain/types/hubspot.types.js';
import type { AppointmentContext } from './appointment.mapper.js';

const ctx: AppointmentContext = {
  reservationId: 'RES-001',
  profileId: 'PROF-001',
  hotelId: 'CAR',
};

function baseAppointment(overrides: Partial<HsAppointment> = {}): HsAppointment {
  return {
    hs_object_id: '401',
    ...overrides,
  };
}

describe('mapHsAppointmentToOracle', () => {
  it('returns empty arrays when appointment has no data', () => {
    const result = mapHsAppointmentToOracle(baseAppointment(), ctx);

    expect(result.activities).toHaveLength(0);
    expect(result.messages).toHaveLength(0);
    expect(result.serviceRequests).toHaveLength(0);
    expect(result.billingCharges).toHaveLength(0);
  });

  // ── Activities → Guest Messages (workaround) ──

  it('maps pending activities to guest message', () => {
    const result = mapHsAppointmentToOracle(
      baseAppointment({ actividades_pendientes_o_reservadas: 'Trekking Las Pircas' }),
      ctx,
    );

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].messageText).toContain('Actividad reservada: Trekking Las Pircas');
    expect(result.messages[0].reservationId).toBe('RES-001');
    expect(result.messages[0].hotelId).toBe('CAR');
  });

  it('maps completed activities to guest message', () => {
    const result = mapHsAppointmentToOracle(
      baseAppointment({ actividades_realizadas: 'Cellar Tour' }),
      ctx,
    );

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].messageText).toContain('Actividad completada: Cellar Tour');
  });

  // ── Comments & incidents → Guest Messages ──

  it('maps guest comments to guest message', () => {
    const result = mapHsAppointmentToOracle(
      baseAppointment({ comentarios_del_huesped: 'Excelente servicio' }),
      ctx,
    );

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].messageText).toBe('Excelente servicio');
  });

  it('maps incidents with type/status/responsable to guest message', () => {
    const result = mapHsAppointmentToOracle(
      baseAppointment({
        descripcion_de_la_incidencia: 'Ruido en habitación vecina',
        tipo_de_incidencia: 'Limpieza',
        estado_incidencia: 'Pendiente',
        responsable_asignado: 'Carlos',
      }),
      ctx,
    );

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].messageText).toContain('Incidencia: Ruido en habitación vecina');
    expect(result.messages[0].messageText).toContain('Tipo: Limpieza');
    expect(result.messages[0].messageText).toContain('Estado: Pendiente');
    expect(result.messages[0].messageText).toContain('Responsable: Carlos');
  });

  it('maps dietary changes to guest message (workaround: no LOV)', () => {
    const result = mapHsAppointmentToOracle(
      baseAppointment({ cambios_dieteticos: 'Sin gluten' }),
      ctx,
    );

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].messageText).toContain('Cambio dietético: Sin gluten');
  });

  // ── New guest experience fields → Guest Messages ──

  it('maps estado_de_animo_general to guest message', () => {
    const result = mapHsAppointmentToOracle(
      baseAppointment({ estado_de_animo_general: 'Feliz' }),
      ctx,
    );

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].messageText).toContain('Estado de ánimo: Feliz');
  });

  it('maps feedback_espontaneo to guest message', () => {
    const result = mapHsAppointmentToOracle(
      baseAppointment({ feedback_espontaneo: 'La vista es increíble' }),
      ctx,
    );

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].messageText).toContain('Feedback: La vista es increíble');
  });

  it('maps observaciones_de_mejora to guest message', () => {
    const result = mapHsAppointmentToOracle(
      baseAppointment({ observaciones_de_mejora: 'Mejorar wifi' }),
      ctx,
    );

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].messageText).toContain('Observación de mejora: Mejorar wifi');
  });

  it('maps servicios_utilizados to guest message', () => {
    const result = mapHsAppointmentToOracle(
      baseAppointment({ servicios_utilizados: 'SPA' }),
      ctx,
    );

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].messageText).toContain('Servicios utilizados: SPA');
  });

  it('maps nivel_de_satisfaccion_actividades to guest message', () => {
    const result = mapHsAppointmentToOracle(
      baseAppointment({ nivel_de_satisfaccion_actividades: '9' }),
      ctx,
    );

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].messageText).toContain('Satisfacción actividades: 9/10');
  });

  it('maps preferencia_de_horario to guest message', () => {
    const result = mapHsAppointmentToOracle(
      baseAppointment({ preferencia_de_horario: 'Mañana' }),
      ctx,
    );

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].messageText).toContain('Preferencia horario: Mañana');
  });

  // ── Maintenance → Service Requests ──

  it('maps maintenance comments to service request', () => {
    const result = mapHsAppointmentToOracle(
      baseAppointment({ comentarios_mantencion: 'Grifo gotea' }),
      ctx,
    );

    expect(result.serviceRequests).toHaveLength(1);
    expect(result.serviceRequests[0].description).toBe('Grifo gotea');
    expect(result.serviceRequests[0].reservationId).toBe('RES-001');
  });

  it('maps room maintenance to service request', () => {
    const result = mapHsAppointmentToOracle(
      baseAppointment({ comentarios_mantencion_habitacion: 'AC no enfría' }),
      ctx,
    );

    expect(result.serviceRequests).toHaveLength(1);
    expect(result.serviceRequests[0].description).toContain('Mantención habitación: AC no enfría');
  });

  it('maps observaciones_de_la_habitacion to service request', () => {
    const result = mapHsAppointmentToOracle(
      baseAppointment({ observaciones_de_la_habitacion: 'Alfombra manchada' }),
      ctx,
    );

    expect(result.serviceRequests).toHaveLength(1);
    expect(result.serviceRequests[0].description).toContain('Observación habitación: Alfombra manchada');
  });

  it('maps housekeeping fields to service request', () => {
    const result = mapHsAppointmentToOracle(
      baseAppointment({
        nombre_housekeeping: 'María',
        tareas_realizadas: 'Cambio de Sábanas',
        velocidad_del_servicio: 'Rápida',
      }),
      ctx,
    );

    expect(result.serviceRequests).toHaveLength(1);
    expect(result.serviceRequests[0].description).toContain('Housekeeping');
    expect(result.serviceRequests[0].description).toContain('Responsable: María');
    expect(result.serviceRequests[0].description).toContain('Tareas: Cambio de Sábanas');
    expect(result.serviceRequests[0].description).toContain('Velocidad: Rápida');
  });

  // ── Meals → Billing Charges ──

  it('maps breakfast to billing charge with txn code 2004', () => {
    const result = mapHsAppointmentToOracle(
      baseAppointment({ descripcion_desayuno_consumido: 'Buffet completo' }),
      ctx,
    );

    expect(result.billingCharges).toHaveLength(1);
    expect(result.billingCharges[0].transactionCode).toBe('2004');
    expect(result.billingCharges[0].description).toBe('Buffet completo');
  });

  it('maps lunch to billing charge with txn code 2010', () => {
    const result = mapHsAppointmentToOracle(
      baseAppointment({ descripcion_almuerzo_consumido: 'Menú del día' }),
      ctx,
    );

    expect(result.billingCharges).toHaveLength(1);
    expect(result.billingCharges[0].transactionCode).toBe('2010');
  });

  it('maps dinner to billing charge with txn code 2020', () => {
    const result = mapHsAppointmentToOracle(
      baseAppointment({ descripcion_cena_consumida: 'Tasting menu' }),
      ctx,
    );

    expect(result.billingCharges).toHaveLength(1);
    expect(result.billingCharges[0].transactionCode).toBe('2020');
  });

  it('maps snacks to billing charge with txn code 2030', () => {
    const result = mapHsAppointmentToOracle(
      baseAppointment({ snacks__bebidas_adicionales: 'Pisco sour x2' }),
      ctx,
    );

    expect(result.billingCharges).toHaveLength(1);
    expect(result.billingCharges[0].transactionCode).toBe('2030');
    expect(result.billingCharges[0].description).toBe('Pisco sour x2');
  });

  it('maps gastos_adicionales_del_dia to billing charge', () => {
    const result = mapHsAppointmentToOracle(
      baseAppointment({ gastos_adicionales_del_dia: '15000' }),
      ctx,
    );

    expect(result.billingCharges).toHaveLength(1);
    expect(result.billingCharges[0].transactionCode).toBe('9000');
    expect(result.billingCharges[0].description).toContain('Gastos adicionales: 15000');
  });

  it('maps tienda_le_club to billing charge', () => {
    const result = mapHsAppointmentToOracle(
      baseAppointment({ tienda_le_club: '25000' }),
      ctx,
    );

    expect(result.billingCharges).toHaveLength(1);
    expect(result.billingCharges[0].transactionCode).toBe('9010');
    expect(result.billingCharges[0].description).toContain('Tienda Le Club: 25000');
  });

  // ── Combination ──

  it('maps a full appointment to all 4 API types', () => {
    const result = mapHsAppointmentToOracle(
      baseAppointment({
        actividades_pendientes_o_reservadas: 'Birdwatching',
        actividades_realizadas: 'Trekking',
        comentarios_del_huesped: 'Muy bonito',
        descripcion_de_la_incidencia: 'Llave no funciona',
        cambios_dieteticos: 'Vegetariano',
        estado_de_animo_general: 'Feliz',
        feedback_espontaneo: 'Excelente',
        observaciones_de_mejora: 'Más toallas',
        servicios_utilizados: 'SPA',
        nivel_de_satisfaccion_actividades: '8',
        preferencia_de_horario: 'Mañana',
        comentarios_mantencion: 'Luz fundida',
        comentarios_mantencion_habitacion: 'Puerta trabada',
        observaciones_de_la_habitacion: 'Alfombra',
        nombre_housekeeping: 'Ana',
        tareas_realizadas: 'Aspirar',
        velocidad_del_servicio: 'Rápida',
        descripcion_desayuno_consumido: 'Continental',
        descripcion_almuerzo_consumido: 'Ensalada',
        descripcion_cena_consumida: 'Parrillada',
        snacks__bebidas_adicionales: 'Jugo',
        gastos_adicionales_del_dia: '5000',
        tienda_le_club: '10000',
      }),
      ctx,
    );

    // Activities as guest messages (workaround) + comments/incidents/mood/feedback/etc.
    expect(result.messages).toHaveLength(11);
    // mantencion + mantencion_habitacion + observaciones_habitacion + housekeeping
    expect(result.serviceRequests).toHaveLength(4);
    // 3 meals + snacks + extras + shop
    expect(result.billingCharges).toHaveLength(6);
    expect(result.activities).toHaveLength(0); // No Oracle activity types configured
  });
});
