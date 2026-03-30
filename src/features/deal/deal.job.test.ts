import { describe, it, expect, vi } from 'vitest';
import { processDeal } from './deal.job.js';
import { cancelDeal } from './deal.cancel.js';
import type { DealJobDeps } from './deal.job.js';
import type { IOracleClient } from '../../domain/ports/oracle.port.js';
import type { IHubSpotClient } from '../../domain/ports/hubspot.port.js';
import type { ILogger } from '../../shared/logger/logger.js';
import type { HsDeal } from '../../domain/types/hubspot.types.js';

function mockLogger(): ILogger {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function baseDeal(overrides: Partial<HsDeal> = {}): HsDeal {
  return {
    hs_object_id: '201',
    dealname: 'Reserva Pérez',
    check_in: '2026-07-01',
    check_out: '2026-07-05',
    room_type: 'CASITA',
    tipo_de_tarifa: 'Half Board',
    n_huespedes: '2',
    n_ninosas: '0',
    estado_de_reserva: 'Confirmada',
    tipo_de_pago: 'Visa (VI)',
    ...overrides,
  };
}

function createDeps(
  oracleOverrides: Partial<IOracleClient> = {},
  hubspotOverrides: Partial<IHubSpotClient> = {},
): DealJobDeps {
  const oracle = {
    createReservation: vi.fn().mockResolvedValue({
      ok: true,
      data: { internalId: 'RES-001', confirmationId: 'CONF-001' },
    }),
    updateReservation: vi.fn().mockResolvedValue({
      ok: true,
      data: { internalId: 'RES-001', confirmationId: 'CONF-001' },
    }),
    cancelReservation: vi.fn().mockResolvedValue({ ok: true, data: 'CXL-001' }),
    createGuestProfile: vi.fn(),
    updateGuestProfile: vi.fn(),
    getGuestProfile: vi.fn(),
    getReservation: vi.fn(),
    createCompanyProfile: vi.fn(),
    updateCompanyProfile: vi.fn(),
    createActivityBooking: vi.fn(),
    updateActivityBooking: vi.fn(),
    createGuestMessage: vi.fn(),
    createServiceRequest: vi.fn(),
    updateServiceRequest: vi.fn(),
    postBillingCharge: vi.fn(),
    ...oracleOverrides,
  } as IOracleClient;

  const hubspot = {
    getDealById: vi.fn().mockResolvedValue({ ok: true, data: baseDeal() }),
    updateDeal: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    getArchivedDealById: vi.fn().mockResolvedValue({ ok: true, data: null }),
    getAssociatedContacts: vi.fn().mockResolvedValue({
      ok: true,
      data: [{ contactId: '101', labels: ['Huésped Principal'] }],
    }),
    getContactById: vi.fn().mockResolvedValue({
      ok: true,
      data: { hs_object_id: '101', firstname: 'Juan', lastname: 'Pérez', id_oracle: 'ORACLE-123' },
    }),
    getCompanyByDealId: vi.fn().mockResolvedValue({ ok: true, data: null }),
    getCompanyById: vi.fn(),
    updateContact: vi.fn(),
    updateCompany: vi.fn(),
    ...hubspotOverrides,
  } as IHubSpotClient;

  return { oracle, hubspot, logger: mockLogger() };
}

describe('processDeal', () => {
  it('creates a new reservation with correct mapping', async () => {
    const deps = createDeps();

    const result = await processDeal(deps, { objectId: '201' });

    expect(result.oracleId).toBe('RES-001');

    const createCall = (deps.oracle.createReservation as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(createCall.roomType).toBe('CASITA');
    expect(createCall.ratePlanCode).toBe('BARHB');
    expect(createCall.adults).toBe(2);
    expect(createCall.children).toBe(0);
    expect(createCall.sourceCode).toBe('HS');
    expect(createCall.reservationStatus).toBe('Reserved');
    expect(createCall.guestProfiles).toEqual([
      { oracleProfileId: 'ORACLE-123', isPrimary: true },
    ]);

    expect(deps.hubspot.updateDeal).toHaveBeenCalledWith('201', {
      id_oracle: 'RES-001',
      'numero_de_reserva_': 'CONF-001',
    });
  });

  it('updates existing reservation when id_oracle present', async () => {
    const deps = createDeps({}, {
      getDealById: vi.fn().mockResolvedValue({ ok: true, data: baseDeal({ id_oracle: 'RES-EXIST' }) }),
      getAssociatedContacts: vi.fn().mockResolvedValue({
        ok: true,
        data: [{ contactId: '101', labels: ['Huésped Principal'] }],
      }),
      getContactById: vi.fn().mockResolvedValue({
        ok: true,
        data: { hs_object_id: '101', firstname: 'Juan', lastname: 'Pérez', id_oracle: 'ORACLE-123' },
      }),
      getCompanyByDealId: vi.fn().mockResolvedValue({ ok: true, data: null }),
    });

    const result = await processDeal(deps, { objectId: '201' });

    expect(result.oracleId).toBe('RES-EXIST');
    expect(deps.oracle.updateReservation).toHaveBeenCalledOnce();
    expect(deps.oracle.createReservation).not.toHaveBeenCalled();
  });

  it('includes travel agent when company has id_oracle', async () => {
    const deps = createDeps({}, {
      getCompanyByDealId: vi.fn().mockResolvedValue({
        ok: true,
        data: { hs_object_id: '301', name: 'Agency', id_oracle: 'AGENT-001' },
      }),
    });

    await processDeal(deps, { objectId: '201' });

    const createCall = (deps.oracle.createReservation as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(createCall.travelAgentId).toBe('AGENT-001');
  });

  it('sets first guest as primary when no label matches', async () => {
    const deps = createDeps({}, {
      getAssociatedContacts: vi.fn().mockResolvedValue({
        ok: true,
        data: [
          { contactId: '101', labels: ['Acompañante'] },
          { contactId: '102', labels: [] },
        ],
      }),
      getContactById: vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          data: { hs_object_id: '101', firstname: 'A', lastname: 'B', id_oracle: 'ORA-1' },
        })
        .mockResolvedValueOnce({
          ok: true,
          data: { hs_object_id: '102', firstname: 'C', lastname: 'D', id_oracle: 'ORA-2' },
        }),
    });

    await processDeal(deps, { objectId: '201' });

    const createCall = (deps.oracle.createReservation as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(createCall.guestProfiles[0].isPrimary).toBe(true);
    expect(createCall.guestProfiles[1].isPrimary).toBe(false);
  });

  it('throws when deal has no contacts', async () => {
    const deps = createDeps({}, {
      getAssociatedContacts: vi.fn().mockResolvedValue({ ok: true, data: [] }),
    });

    await expect(processDeal(deps, { objectId: '201' })).rejects.toThrow('no associated contacts');
  });

  it('throws when contact has no id_oracle', async () => {
    const deps = createDeps({}, {
      getContactById: vi.fn().mockResolvedValue({
        ok: true,
        data: { hs_object_id: '101', firstname: 'Juan', lastname: 'P', id_oracle: null },
      }),
    });

    await expect(processDeal(deps, { objectId: '201' })).rejects.toThrow('no Oracle profile ID');
  });

  it('maps payment method correctly (Visa VI → Oracle VA)', async () => {
    const deps = createDeps({}, {
      getDealById: vi.fn().mockResolvedValue({
        ok: true,
        data: baseDeal({ tipo_de_pago: 'Visa (VI)' }),
      }),
    });

    await processDeal(deps, { objectId: '201' });

    // PaymentMethodMap maps 'Visa (VI)' → 'VA'
    const createCall = (deps.oracle.createReservation as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(createCall.paymentMethod).toBe('VA');
  });
});

describe('cancelDeal', () => {
  it('cancels an active deal reservation', async () => {
    const deps = createDeps({}, {
      getDealById: vi.fn().mockResolvedValue({
        ok: true,
        data: baseDeal({ id_oracle: 'RES-001' }),
      }),
    });

    const result = await cancelDeal(
      { ...deps, cancellationReasonCode: 'CANCEL' },
      { objectId: '201' },
    );

    expect(result.oracleId).toBe('RES-001');
    expect(deps.oracle.cancelReservation).toHaveBeenCalledWith('RES-001', 'CANCEL');
  });

  it('finds Oracle ID from archived deal when active deal fails', async () => {
    const deps = createDeps({}, {
      getDealById: vi.fn().mockResolvedValue({
        ok: false,
        error: { code: 'HUBSPOT_404', message: 'Not found', statusCode: 404 },
      }),
      getArchivedDealById: vi.fn().mockResolvedValue({
        ok: true,
        data: baseDeal({ id_oracle: 'RES-ARCHIVED' }),
      }),
    });

    const result = await cancelDeal(
      { ...deps, cancellationReasonCode: 'CANCEL' },
      { objectId: '201' },
    );

    expect(result.oracleId).toBe('RES-ARCHIVED');
    expect(deps.oracle.cancelReservation).toHaveBeenCalledWith('RES-ARCHIVED', 'CANCEL');
  });

  it('skips cancellation when no Oracle ID found', async () => {
    const deps = createDeps({}, {
      getDealById: vi.fn().mockResolvedValue({
        ok: true,
        data: baseDeal({ id_oracle: null }),
      }),
    });

    const result = await cancelDeal(
      { ...deps, cancellationReasonCode: 'CANCEL' },
      { objectId: '201' },
    );

    expect(result.oracleId).toBeUndefined();
    expect(deps.oracle.cancelReservation).not.toHaveBeenCalled();
  });
});
