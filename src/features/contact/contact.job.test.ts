import { describe, it, expect, vi } from 'vitest';
import { processContact } from './contact.job.js';
import type { ContactJobDeps } from './contact.job.js';
import type { IOracleClient } from '../../domain/ports/oracle.port.js';
import type { IHubSpotClient } from '../../domain/ports/hubspot.port.js';
import type { ILogger } from '../../shared/logger/logger.js';
import type { HsContact } from '../../domain/types/hubspot.types.js';

function mockLogger(): ILogger {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function baseContact(overrides: Partial<HsContact> = {}): HsContact {
  return {
    hs_object_id: '101',
    firstname: 'Juan',
    lastname: 'Pérez',
    email: 'juan@test.com',
    phone: '+56912345678',
    ...overrides,
  };
}

function createDeps(
  oracleOverrides: Partial<IOracleClient> = {},
  hubspotOverrides: Partial<IHubSpotClient> = {},
): ContactJobDeps {
  const oracle = {
    createGuestProfile: vi.fn().mockResolvedValue({ ok: true, data: 'ORACLE-NEW' }),
    updateGuestProfile: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    getGuestProfile: vi.fn(),
    createCompanyProfile: vi.fn(),
    updateCompanyProfile: vi.fn(),
    createReservation: vi.fn(),
    updateReservation: vi.fn(),
    getReservation: vi.fn(),
    cancelReservation: vi.fn(),
    createActivityBooking: vi.fn(),
    updateActivityBooking: vi.fn(),
    createGuestMessage: vi.fn(),
    createServiceRequest: vi.fn(),
    updateServiceRequest: vi.fn(),
    postBillingCharge: vi.fn(),
    ...oracleOverrides,
  } as IOracleClient;

  const hubspot = {
    getContactById: vi.fn().mockResolvedValue({ ok: true, data: baseContact() }),
    updateContact: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    getDealById: vi.fn(),
    updateDeal: vi.fn(),
    getArchivedDealById: vi.fn(),
    getCompanyById: vi.fn(),
    updateCompany: vi.fn(),
    getAssociatedContacts: vi.fn(),
    getCompanyByDealId: vi.fn(),
    ...hubspotOverrides,
  } as IHubSpotClient;

  return { oracle, hubspot, logger: mockLogger() };
}

describe('processContact', () => {
  it('creates a new Oracle profile when contact has no id_oracle', async () => {
    const deps = createDeps();

    const result = await processContact(deps, { objectId: '101' });

    expect(result.oracleId).toBe('ORACLE-NEW');
    expect(deps.oracle.createGuestProfile).toHaveBeenCalledOnce();
    expect(deps.hubspot.updateContact).toHaveBeenCalledWith('101', { id_oracle: 'ORACLE-NEW' });
  });

  it('updates existing Oracle profile when contact has id_oracle', async () => {
    const deps = createDeps({}, {
      getContactById: vi.fn().mockResolvedValue({
        ok: true,
        data: baseContact({ id_oracle: 'ORACLE-EXISTING' }),
      }),
    });

    const result = await processContact(deps, { objectId: '101' });

    expect(result.oracleId).toBe('ORACLE-EXISTING');
    expect(deps.oracle.updateGuestProfile).toHaveBeenCalledOnce();
    expect(deps.oracle.createGuestProfile).not.toHaveBeenCalled();
  });

  it('maps contact fields to GuestProfile correctly', async () => {
    const contact = baseContact({
      pasaporte: 'AB123456',
      rut: '12.345.678-9',
      hs_language: 'es',
      pais: 'CL',
      fecha_de_nacimiento: '1985-03-15',
      huesped_vip: 'VIP',
    });

    const deps = createDeps({}, {
      getContactById: vi.fn().mockResolvedValue({ ok: true, data: contact }),
    });

    await processContact(deps, { objectId: '101' });

    const createCall = (deps.oracle.createGuestProfile as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(createCall.givenName).toBe('Juan');
    expect(createCall.surname).toBe('Pérez');
    expect(createCall.email).toBe('juan@test.com');
    expect(createCall.phoneNumber).toBe('+56912345678');
    expect(createCall.language).toBe('es');
    expect(createCall.nationality).toBe('CL');
    expect(createCall.birthDate).toBe('1985-03-15');
    expect(createCall.vipCode).toBe('VIP');
    expect(createCall.identifications).toEqual([
      { idType: 'PASSPORT', idNumber: 'AB123456' },
      { idType: 'TAX_ID', idNumber: '12.345.678-9' },
    ]);
  });

  it('throws when HubSpot getContact fails', async () => {
    const hsError = { code: 'HUBSPOT_OBJECT_NOT_FOUND', message: 'Not found', statusCode: 404 };
    const deps = createDeps({}, {
      getContactById: vi.fn().mockResolvedValue({ ok: false, error: hsError }),
    });

    await expect(processContact(deps, { objectId: '999' })).rejects.toEqual(hsError);
  });

  it('throws when Oracle createGuestProfile fails', async () => {
    const oracleErr = { code: 'ORACLE_400', message: 'Bad request', statusCode: 400 };
    const deps = createDeps({
      createGuestProfile: vi.fn().mockResolvedValue({ ok: false, error: oracleErr }),
    });

    await expect(processContact(deps, { objectId: '101' })).rejects.toEqual(oracleErr);
  });

  it('logs error but does not throw if writeback fails', async () => {
    const deps = createDeps({}, {
      getContactById: vi.fn().mockResolvedValue({ ok: true, data: baseContact() }),
      updateContact: vi.fn().mockResolvedValue({
        ok: false,
        error: { code: 'HUBSPOT_429', message: 'Rate limited', statusCode: 429 },
      }),
    });

    // Should not throw
    const result = await processContact(deps, { objectId: '101' });
    expect(result.oracleId).toBe('ORACLE-NEW');
    expect(deps.logger.error).toHaveBeenCalledWith(
      'Failed to write Oracle ID back to HubSpot',
      expect.objectContaining({ objectId: '101', oracleId: 'ORACLE-NEW' }),
    );
  });
});
