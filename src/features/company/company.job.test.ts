import { describe, it, expect, vi } from 'vitest';
import { processCompany } from './company.job.js';
import type { CompanyJobDeps } from './company.job.js';
import type { IOracleClient } from '../../domain/ports/oracle.port.js';
import type { IHubSpotClient } from '../../domain/ports/hubspot.port.js';
import type { ILogger } from '../../shared/logger/logger.js';
import type { HsCompany } from '../../domain/types/hubspot.types.js';

function mockLogger(): ILogger {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function baseCompany(overrides: Partial<HsCompany> = {}): HsCompany {
  return {
    hs_object_id: '301',
    name: 'Viajes Chile',
    tipo_de_empresa: 'Agencia',
    iata_code: 'IATA001',
    email_agencia: 'info@viajes.cl',
    phone: '+562123456',
    ...overrides,
  };
}

function createDeps(
  oracleOverrides: Partial<IOracleClient> = {},
  hubspotOverrides: Partial<IHubSpotClient> = {},
): CompanyJobDeps {
  const oracle = {
    createCompanyProfile: vi.fn().mockResolvedValue({ ok: true, data: 'CORP-NEW' }),
    updateCompanyProfile: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    createGuestProfile: vi.fn(),
    updateGuestProfile: vi.fn(),
    getGuestProfile: vi.fn(),
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
    getCompanyById: vi.fn().mockResolvedValue({ ok: true, data: baseCompany() }),
    updateCompany: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    getContactById: vi.fn(),
    updateContact: vi.fn(),
    getDealById: vi.fn(),
    updateDeal: vi.fn(),
    getArchivedDealById: vi.fn(),
    getAssociatedContacts: vi.fn(),
    getCompanyByDealId: vi.fn(),
    ...hubspotOverrides,
  } as IHubSpotClient;

  return { oracle, hubspot, logger: mockLogger() };
}

describe('processCompany', () => {
  it('creates new Oracle company profile (TravelAgent)', async () => {
    const deps = createDeps();

    const result = await processCompany(deps, { objectId: '301' });

    expect(result.oracleId).toBe('CORP-NEW');
    const createCall = (deps.oracle.createCompanyProfile as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(createCall.profileType).toBe('TravelAgent');
    expect(createCall.companyName).toBe('Viajes Chile');
    expect(createCall.iataCode).toBe('IATA001');
    expect(deps.hubspot.updateCompany).toHaveBeenCalledWith('301', { id_oracle: 'CORP-NEW' });
  });

  it('creates Company profile for Proveedor without iata_code', async () => {
    const deps = createDeps({}, {
      getCompanyById: vi.fn().mockResolvedValue({
        ok: true,
        data: baseCompany({ tipo_de_empresa: 'Proveedor', iata_code: null }),
      }),
    });

    await processCompany(deps, { objectId: '301' });

    const createCall = (deps.oracle.createCompanyProfile as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(createCall.profileType).toBe('Company');
  });

  it('creates TravelAgent when iata_code present even for Proveedor', async () => {
    const deps = createDeps({}, {
      getCompanyById: vi.fn().mockResolvedValue({
        ok: true,
        data: baseCompany({ tipo_de_empresa: 'Proveedor', iata_code: 'IATA999' }),
      }),
    });

    await processCompany(deps, { objectId: '301' });

    const createCall = (deps.oracle.createCompanyProfile as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(createCall.profileType).toBe('TravelAgent');
  });

  it('updates existing Oracle profile when id_oracle present', async () => {
    const deps = createDeps({}, {
      getCompanyById: vi.fn().mockResolvedValue({
        ok: true,
        data: baseCompany({ id_oracle: 'CORP-EXISTING' }),
      }),
    });

    const result = await processCompany(deps, { objectId: '301' });

    expect(result.oracleId).toBe('CORP-EXISTING');
    expect(deps.oracle.updateCompanyProfile).toHaveBeenCalledOnce();
    expect(deps.oracle.createCompanyProfile).not.toHaveBeenCalled();
  });

  it('skips company without name', async () => {
    const deps = createDeps({}, {
      getCompanyById: vi.fn().mockResolvedValue({
        ok: true,
        data: baseCompany({ name: '' }),
      }),
    });

    const result = await processCompany(deps, { objectId: '301' });

    expect(result.oracleId).toBeUndefined();
    expect(deps.oracle.createCompanyProfile).not.toHaveBeenCalled();
    expect(deps.logger.warn).toHaveBeenCalled();
  });

  it('creates Company profile for CVR', async () => {
    const deps = createDeps({}, {
      getCompanyById: vi.fn().mockResolvedValue({
        ok: true,
        data: baseCompany({ tipo_de_empresa: 'CVR', iata_code: null }),
      }),
    });

    await processCompany(deps, { objectId: '301' });

    const createCall = (deps.oracle.createCompanyProfile as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(createCall.profileType).toBe('Company');
  });
});
