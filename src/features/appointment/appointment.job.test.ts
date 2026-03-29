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

  it('maps incidents to guest message', () => {
    const result = mapHsAppointmentToOracle(
      baseAppointment({ descripcion_de_la_incidencia: 'Ruido en habitación vecina' }),
      ctx,
    );

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].messageText).toContain('Incidencia: Ruido en habitación vecina');
  });

  it('maps dietary changes to guest message (workaround: no LOV)', () => {
    const result = mapHsAppointmentToOracle(
      baseAppointment({ cambios_dieteticos: 'Sin gluten' }),
      ctx,
    );

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].messageText).toContain('Cambio dietético: Sin gluten');
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

  // ── Combination ──

  it('maps a full appointment to all 4 API types', () => {
    const result = mapHsAppointmentToOracle(
      baseAppointment({
        actividades_pendientes_o_reservadas: 'Birdwatching',
        actividades_realizadas: 'Trekking',
        comentarios_del_huesped: 'Muy bonito',
        descripcion_de_la_incidencia: 'Llave no funciona',
        cambios_dieteticos: 'Vegetariano',
        comentarios_mantencion: 'Luz fundida',
        comentarios_mantencion_habitacion: 'Puerta trabada',
        descripcion_desayuno_consumido: 'Continental',
        descripcion_almuerzo_consumido: 'Ensalada',
        descripcion_cena_consumida: 'Parrillada',
      }),
      ctx,
    );

    // Activities as guest messages (workaround) + comments/incidents/dietary
    expect(result.messages).toHaveLength(5);
    expect(result.serviceRequests).toHaveLength(2);
    expect(result.billingCharges).toHaveLength(3);
    expect(result.activities).toHaveLength(0); // No Oracle activity types configured
  });
});
