import { describe, it, expect, vi } from 'vitest';
import { processAppointment } from './appointment.job.js';
import type { AppointmentJobDeps } from './appointment.job.js';
import type { IOracleClient } from '../../domain/ports/oracle.port.js';
import type { IHubSpotClient } from '../../domain/ports/hubspot.port.js';
import type { ILogger } from '../../shared/logger/logger.js';
import type { HsAppointment } from '../../domain/types/hubspot.types.js';

function mockLogger(): ILogger {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function baseAppointment(overrides: Partial<HsAppointment> = {}): HsAppointment {
  return {
    hs_object_id: '401',
    comentarios_del_huesped: 'Todo perfecto',
    descripcion_desayuno_consumido: 'Buffet',
    ...overrides,
  };
}

function createDeps(
  oracleOverrides: Partial<IOracleClient> = {},
  hubspotOverrides: Partial<IHubSpotClient> = {},
): AppointmentJobDeps {
  const oracle = {
    createGuestProfile: vi.fn(),
    updateGuestProfile: vi.fn(),
    getGuestProfile: vi.fn(),
    createReservation: vi.fn(),
    updateReservation: vi.fn(),
    getReservation: vi.fn(),
    cancelReservation: vi.fn(),
    createCompanyProfile: vi.fn(),
    updateCompanyProfile: vi.fn(),
    createActivityBooking: vi.fn().mockResolvedValue({ ok: true, data: 'ACT-001' }),
    updateActivityBooking: vi.fn(),
    createGuestMessage: vi.fn().mockResolvedValue({ ok: true, data: 'MSG-001' }),
    createServiceRequest: vi.fn().mockResolvedValue({ ok: true, data: 'SR-001' }),
    updateServiceRequest: vi.fn(),
    postBillingCharge: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    ...oracleOverrides,
  } as IOracleClient;

  const hubspot = {
    getAppointmentById: vi.fn().mockResolvedValue({ ok: true, data: baseAppointment() }),
    getAssociatedDealForAppointment: vi.fn().mockResolvedValue({ ok: true, data: '201' }),
    getDealById: vi.fn().mockResolvedValue({
      ok: true,
      data: {
        hs_object_id: '201', dealname: 'Reserva Test',
        check_in: '2026-07-01', check_out: '2026-07-05',
        room_type: 'CASITA', tipo_de_tarifa: 'Half Board',
        n_huespedes: '2', n_ninosas: '0', estado_de_reserva: 'Confirmada',
        id_oracle: 'RES-001',
      },
    }),
    getAssociatedContacts: vi.fn().mockResolvedValue({
      ok: true,
      data: [{ contactId: '101', labels: ['Huésped Principal'] }],
    }),
    getContactById: vi.fn().mockResolvedValue({
      ok: true,
      data: { hs_object_id: '101', firstname: 'Juan', lastname: 'Pérez', id_oracle: 'PROF-001' },
    }),
    updateDeal: vi.fn(),
    updateContact: vi.fn(),
    getArchivedDealById: vi.fn(),
    getCompanyById: vi.fn(),
    updateCompany: vi.fn(),
    getCompanyByDealId: vi.fn(),
    ...hubspotOverrides,
  } as IHubSpotClient;

  return { oracle, hubspot, logger: mockLogger(), hotelId: 'CAR' };
}

describe('processAppointment', () => {
  it('fetches appointment from HubSpot and sends to Oracle', async () => {
    const deps = createDeps();

    const result = await processAppointment(deps, { objectId: '401' });

    expect(result.oracleId).toBe('RES-001');
    expect(deps.hubspot.getAppointmentById).toHaveBeenCalledWith('401');
    expect(deps.hubspot.getAssociatedDealForAppointment).toHaveBeenCalledWith('401');
    // 1 guest comment + 1 breakfast = 1 message + 1 billing charge
    expect(deps.oracle.createGuestMessage).toHaveBeenCalledOnce();
    expect(deps.oracle.postBillingCharge).toHaveBeenCalledOnce();
  });

  it('skips when appointment has no associated deal', async () => {
    const deps = createDeps({}, {
      getAssociatedDealForAppointment: vi.fn().mockResolvedValue({ ok: true, data: null }),
    });

    const result = await processAppointment(deps, { objectId: '401' });

    expect(result.oracleId).toBeUndefined();
    expect(deps.oracle.createGuestMessage).not.toHaveBeenCalled();
  });

  it('throws when deal has no Oracle reservation ID', async () => {
    const deps = createDeps({}, {
      getDealById: vi.fn().mockResolvedValue({
        ok: true,
        data: {
          hs_object_id: '201', dealname: 'Test',
          check_in: '2026-07-01', check_out: '2026-07-05',
          room_type: 'CASITA', tipo_de_tarifa: 'Half Board',
          n_huespedes: '2', n_ninosas: '0', estado_de_reserva: 'Confirmada',
          id_oracle: null,
        },
      }),
    });

    await expect(processAppointment(deps, { objectId: '401' }))
      .rejects.toThrow('no Oracle reservation ID');
  });

  it('throws when no contact has Oracle profile ID', async () => {
    const deps = createDeps({}, {
      getContactById: vi.fn().mockResolvedValue({
        ok: true,
        data: { hs_object_id: '101', firstname: 'Juan', lastname: 'P', id_oracle: null },
      }),
    });

    await expect(processAppointment(deps, { objectId: '401' }))
      .rejects.toThrow('No contact with Oracle profile ID');
  });

  it('sends all 4 API types for a full appointment', async () => {
    const deps = createDeps({}, {
      getAppointmentById: vi.fn().mockResolvedValue({
        ok: true,
        data: baseAppointment({
          actividades_pendientes_o_reservadas: 'Trekking',
          comentarios_del_huesped: 'Genial',
          comentarios_mantencion: 'Grifo gotea',
          descripcion_desayuno_consumido: 'Buffet',
        }),
      }),
    });

    const result = await processAppointment(deps, { objectId: '401' });

    expect(result.oracleId).toBe('RES-001');
    // 1 activity message + 1 guest comment = 2 messages
    expect(deps.oracle.createGuestMessage).toHaveBeenCalledTimes(2);
    // 1 maintenance service request
    expect(deps.oracle.createServiceRequest).toHaveBeenCalledOnce();
    // 1 breakfast billing charge
    expect(deps.oracle.postBillingCharge).toHaveBeenCalledOnce();
  });
});
