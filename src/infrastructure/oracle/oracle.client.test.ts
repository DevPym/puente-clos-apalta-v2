import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { OracleClient } from './oracle.client.js';
import type { OracleClientConfig } from './oracle.client.js';
import type { OracleAuth } from './oracle.auth.js';
import type { ILogger } from '../../shared/logger/logger.js';
import type { GuestProfile, CompanyProfile, OracleReservation } from '../../domain/types/oracle.types.js';

vi.mock('axios', () => {
  const mockAxiosInstance = {
    request: vi.fn(),
  };
  return {
    default: {
      create: vi.fn(() => mockAxiosInstance),
      isAxiosError: vi.fn((err: unknown) => err instanceof Error && 'isAxiosError' in err),
    },
  };
});

function createMockAuth(): OracleAuth {
  return {
    getToken: vi.fn().mockResolvedValue('mock-token'),
    refreshToken: vi.fn().mockResolvedValue('new-mock-token'),
    invalidateToken: vi.fn(),
  } as unknown as OracleAuth;
}

function createMockLogger(): ILogger {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

const clientConfig: OracleClientConfig = {
  baseUrl: 'https://oracle.test.com',
  hotelId: 'CAR',
  appKey: '00000000-0000-4000-8000-000000000000',
  externalSystem: 'CLOSAP_HS',
};

function getHttpMock() {
  const instance = axios.create({} as Parameters<typeof axios.create>[0]);
  return instance.request as ReturnType<typeof vi.fn>;
}

describe('OracleClient', () => {
  let client: OracleClient;
  let mockAuth: OracleAuth;
  let mockLogger: ILogger;
  let httpRequest: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth = createMockAuth();
    mockLogger = createMockLogger();
    client = new OracleClient(clientConfig, mockAuth, mockLogger);
    httpRequest = getHttpMock();
  });

  // ── createGuestProfile ──

  describe('createGuestProfile', () => {
    const profile: GuestProfile = {
      givenName: 'Juan',
      surname: 'Pérez',
      email: 'juan@test.com',
      phoneNumber: '+56912345678',
    };

    it('creates a guest profile and returns the oracle ID from HATEOAS links', async () => {
      httpRequest.mockResolvedValueOnce({
        status: 201,
        data: {
          links: [{ href: 'https://oracle.test.com/crm/v1/profiles/37510671', rel: 'self', method: 'PUT' }],
        },
      });

      const result = await client.createGuestProfile(profile);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toBe('37510671');
      }
      expect(httpRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: '/crm/v1/guests',
        }),
      );
    });

    it('sends correct payload structure', async () => {
      httpRequest.mockResolvedValueOnce({
        status: 201,
        data: { guestIdList: [{ type: 'Profile', id: 'P-1' }] },
      });

      await client.createGuestProfile(profile);

      const callPayload = httpRequest.mock.calls[0][0].data;
      expect(callPayload.guestDetails.customer.personName[0].givenName).toBe('Juan');
      expect(callPayload.guestDetails.customer.personName[0].surname).toBe('Pérez');
      expect(callPayload.guestDetails.emails.emailInfo[0].email.emailAddress).toBe('juan@test.com');
      expect(callPayload.guestDetails.telephones.telephoneInfo[0]).toEqual({
        telephone: { phoneTechType: 'PHONE', phoneNumber: '+56912345678' },
      });
    });

    it('includes identifications when provided', async () => {
      httpRequest.mockResolvedValueOnce({
        status: 201,
        data: { guestIdList: [{ type: 'Profile', id: 'P-2' }] },
      });

      const profileWithIds: GuestProfile = {
        ...profile,
        identifications: [
          { idType: 'PASSPORT', idNumber: 'AB123456' },
          { idType: 'TAX_ID', idNumber: '12.345.678-9' },
        ],
      };

      await client.createGuestProfile(profileWithIds);

      const callPayload = httpRequest.mock.calls[0][0].data;
      const idInfo = callPayload.guestDetails.customer.identifications.identificationInfo;
      expect(idInfo).toHaveLength(2);
      expect(idInfo[0].identification.idType).toBe('PASSPORT');
    });

    it('returns error on API failure', async () => {
      const apiError = new Error('Bad Request') as Error & { isAxiosError: boolean; response: unknown };
      apiError.isAxiosError = true;
      apiError.response = {
        status: 400,
        data: {
          title: 'Bad Request',
          'o:errorCode': 'INVALID_PARAMETER',
          detail: 'Missing required field: surname',
        },
      };
      (axios.isAxiosError as ReturnType<typeof vi.fn>).mockReturnValueOnce(true);
      httpRequest.mockRejectedValueOnce(apiError);

      const result = await client.createGuestProfile({ givenName: 'Juan', surname: '' });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('ORACLE_INVALID_PARAMETER');
        expect(result.error.statusCode).toBe(400);
      }
    });
  });

  // ── updateGuestProfile ──

  describe('updateGuestProfile', () => {
    it('sends PUT to correct path with profileDetails', async () => {
      httpRequest.mockResolvedValueOnce({ status: 200, data: {} });

      const result = await client.updateGuestProfile('ORACLE-123', { email: 'new@test.com' });

      expect(result.ok).toBe(true);
      expect(httpRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'PUT',
          url: '/crm/v1/profiles/ORACLE-123',
        }),
      );
      const callPayload = httpRequest.mock.calls[0][0].data;
      expect(callPayload.profileDetails).toBeDefined();
      expect(callPayload.guestDetails).toBeUndefined();
    });
  });

  // ── getGuestProfile ──

  describe('getGuestProfile', () => {
    it('sends GET and parses response', async () => {
      httpRequest.mockResolvedValueOnce({
        status: 200,
        data: {
          guestDetails: {
            customer: { givenName: 'María', surname: 'López' },
          },
        },
      });

      const result = await client.getGuestProfile('ORACLE-456');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.givenName).toBe('María');
        expect(result.data.surname).toBe('López');
      }
      expect(httpRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          url: '/crm/v1/guests/ORACLE-456',
        }),
      );
    });
  });

  // ── createCompanyProfile ──

  describe('createCompanyProfile', () => {
    const company: CompanyProfile = {
      companyName: 'Viajes Chile',
      profileType: 'TravelAgent',
      iataCode: 'IATA001',
      email: 'info@viajeschile.cl',
    };

    it('creates a company and returns the oracle ID from HATEOAS links', async () => {
      httpRequest.mockResolvedValueOnce({
        status: 201,
        data: {
          links: [{ href: 'https://oracle.test.com/crm/v1/profiles/99887766', rel: 'self', method: 'PUT' }],
        },
      });

      const result = await client.createCompanyProfile(company);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toBe('99887766');
      }
      expect(httpRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: '/crm/v1/companies',
        }),
      );
    });

    it('sends correct company payload', async () => {
      httpRequest.mockResolvedValueOnce({
        status: 201,
        data: { companyIdList: [{ type: 'Profile', id: 'CORP-1' }] },
      });

      await client.createCompanyProfile(company);

      const callPayload = httpRequest.mock.calls[0][0].data;
      expect(callPayload.companyDetails.company.companyName).toBe('Viajes Chile');
      expect(callPayload.companyDetails.profileType).toBe('TravelAgent');
      expect(callPayload.companyDetails.iATAInfo.iATACompany).toBe('IATA001');
    });
  });

  // ── createReservation ──

  describe('createReservation', () => {
    const reservation: OracleReservation = {
      arrivalDate: '2026-07-01',
      departureDate: '2026-07-05',
      roomType: 'CASITA',
      ratePlanCode: 'BARHB',
      adults: 2,
      children: 0,
      numberOfRooms: 1,
      guestProfiles: [{ oracleProfileId: 'ORACLE-123', isPrimary: true }],
      sourceCode: 'HS',
      sourceType: 'PMS',
      reservationStatus: 'Reserved',
      isPseudoRoom: false,
      currencyCode: 'CLP',
    };

    it('creates a reservation and returns IDs', async () => {
      httpRequest.mockResolvedValueOnce({
        status: 201,
        data: {
          reservationIdList: [
            { type: 'Reservation', id: 'RES-001' },
            { type: 'Confirmation', id: 'CONF-001' },
          ],
        },
      });

      const result = await client.createReservation(reservation);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.internalId).toBe('RES-001');
        expect(result.data.confirmationId).toBe('CONF-001');
      }
      expect(httpRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: '/rsv/v1/hotels/CAR/reservations',
        }),
      );
    });

    it('includes travel agent and payment method in payload', async () => {
      httpRequest.mockResolvedValueOnce({
        status: 201,
        data: { reservationIdList: [{ type: 'Reservation', id: 'RES-002' }] },
      });

      const resWithAgent: OracleReservation = {
        ...reservation,
        travelAgentId: 'AGENT-001',
        paymentMethod: 'VA',
        comments: 'VIP guest',
      };

      await client.createReservation(resWithAgent);

      const callPayload = httpRequest.mock.calls[0][0].data;
      const res = callPayload.reservations.reservation;
      expect(res.travelAgent.profileId.id).toBe('AGENT-001');
      expect(res.cashiering.paymentMethod).toBe('VA');
      expect(res.comments[0].text).toBe('VIP guest');
    });
  });

  // ── cancelReservation ──

  describe('cancelReservation', () => {
    it('sends POST to cancellation endpoint', async () => {
      httpRequest.mockResolvedValueOnce({
        status: 200,
        data: { cancellationNumber: 'CXL-001' },
      });

      const result = await client.cancelReservation('RES-001', 'CANCEL');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toBe('CXL-001');
      }
      expect(httpRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: '/rsv/v1/hotels/CAR/reservations/RES-001/cancellations',
        }),
      );
    });
  });

  // ── createGuestMessage ──

  describe('createGuestMessage', () => {
    it('sends POST to guest messages endpoint', async () => {
      httpRequest.mockResolvedValueOnce({
        status: 201,
        data: { guestMessageId: 'MSG-001' },
      });

      const result = await client.createGuestMessage({
        messageText: 'Guest is vegetarian',
        messageType: 'dietary',
        reservationId: 'RES-001',
        hotelId: 'CAR',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toBe('MSG-001');
      }
      expect(httpRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: '/fof/v1/hotels/CAR/guestMessages',
        }),
      );
    });
  });

  // ── createServiceRequest ──

  describe('createServiceRequest', () => {
    it('sends POST to service requests endpoint', async () => {
      httpRequest.mockResolvedValueOnce({
        status: 201,
        data: { serviceRequestId: 'SR-001' },
      });

      const result = await client.createServiceRequest({
        description: 'AC not working',
        roomId: '101',
        reservationId: 'RES-001',
        hotelId: 'CAR',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toBe('SR-001');
      }
      expect(httpRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: '/fof/v1/hotels/CAR/serviceRequests',
        }),
      );
    });
  });

  // ── postBillingCharge ──

  describe('postBillingCharge', () => {
    it('sends POST to charges endpoint', async () => {
      httpRequest.mockResolvedValueOnce({ status: 201, data: {} });

      const result = await client.postBillingCharge({
        transactionCode: '2004',
        description: 'Breakfast - buffet',
        reservationId: 'RES-001',
        hotelId: 'CAR',
      });

      expect(result.ok).toBe(true);
      expect(httpRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: '/csh/v1/hotels/CAR/charges',
        }),
      );
    });

    it('includes amount when provided', async () => {
      httpRequest.mockResolvedValueOnce({ status: 201, data: {} });

      await client.postBillingCharge({
        transactionCode: '2020',
        description: 'Dinner - tasting menu',
        amount: '85000',
        reservationId: 'RES-001',
        hotelId: 'CAR',
      });

      const callPayload = httpRequest.mock.calls[0][0].data;
      expect(callPayload.charges[0].price).toEqual({
        amount: 85000,
        currencyCode: 'CLP',
      });
    });
  });

  // ── Token refresh on 401 ──

  describe('token refresh on 401', () => {
    it('retries once after refreshing token on 401', async () => {
      const axiosError = new Error('Unauthorized') as Error & { isAxiosError: boolean; response: unknown };
      axiosError.isAxiosError = true;
      axiosError.response = {
        status: 401,
        data: { title: 'Unauthorized', 'o:errorCode': 'UNAUTHORIZED', detail: 'Token expired' },
      };

      (axios.isAxiosError as ReturnType<typeof vi.fn>).mockReturnValueOnce(true);
      httpRequest.mockRejectedValueOnce(axiosError);
      httpRequest.mockResolvedValueOnce({
        status: 200,
        data: {
          guestDetails: {
            customer: { givenName: 'Ana', surname: 'Soto' },
          },
        },
      });

      const result = await client.getGuestProfile('ORACLE-789');

      expect(result.ok).toBe(true);
      expect(mockAuth.invalidateToken).toHaveBeenCalled();
      expect(mockAuth.refreshToken).toHaveBeenCalled();
      expect(httpRequest).toHaveBeenCalledTimes(2);
    });
  });

  // ── Authorization header ──

  describe('authorization', () => {
    it('sends Bearer token in Authorization header', async () => {
      httpRequest.mockResolvedValueOnce({
        status: 200,
        data: { guestDetails: { customer: { givenName: 'Test', surname: 'User' } } },
      });

      await client.getGuestProfile('ORACLE-100');

      const callHeaders = httpRequest.mock.calls[0][0].headers;
      expect(callHeaders.Authorization).toBe('Bearer mock-token');
    });
  });
});
