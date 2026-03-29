import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HubSpotClient } from './hubspot.client.js';
import type { HubSpotClientConfig } from './hubspot.client.js';
import type { ILogger } from '../../shared/logger/logger.js';

// Mock the HubSpot SDK — mocks declared inside factory to avoid hoisting issues
const mockBasicApi = {
  getById: vi.fn(),
  update: vi.fn(),
};

const mockDealsBasicApi = {
  getById: vi.fn(),
  update: vi.fn(),
};

const mockCompaniesBasicApi = {
  getById: vi.fn(),
  update: vi.fn(),
};

const mockAssociationsV4BasicApi = {
  getPage: vi.fn(),
};

vi.mock('@hubspot/api-client', () => ({
  Client: class MockClient {
    crm = {
      contacts: { basicApi: mockBasicApi },
      deals: { basicApi: mockDealsBasicApi },
      companies: { basicApi: mockCompaniesBasicApi },
      associations: {
        v4: { basicApi: mockAssociationsV4BasicApi },
      },
    };
  },
}));

function createMockLogger(): ILogger {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

const clientConfig: HubSpotClientConfig = {
  accessToken: 'pat-test-token',
};

describe('HubSpotClient', () => {
  let client: HubSpotClient;
  let mockLogger: ILogger;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLogger = createMockLogger();
    client = new HubSpotClient(clientConfig, mockLogger);
  });

  // ── getContactById ──

  describe('getContactById', () => {
    it('returns contact with properties', async () => {
      mockBasicApi.getById.mockResolvedValueOnce({
        id: '101',
        properties: {
          firstname: 'Juan',
          lastname: 'Pérez',
          email: 'juan@test.com',
          id_oracle: 'ORACLE-123',
        },
      });

      const result = await client.getContactById('101');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.hs_object_id).toBe('101');
        expect(result.data.firstname).toBe('Juan');
        expect(result.data.lastname).toBe('Pérez');
        expect(result.data.email).toBe('juan@test.com');
        expect(result.data.id_oracle).toBe('ORACLE-123');
      }
    });

    it('returns error when contact not found', async () => {
      const error = { code: 404, body: { category: 'OBJECT_NOT_FOUND', message: 'Contact not found' } };
      mockBasicApi.getById.mockRejectedValueOnce(error);

      const result = await client.getContactById('999');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('HUBSPOT_OBJECT_NOT_FOUND');
        expect(result.error.statusCode).toBe(404);
      }
    });
  });

  // ── updateContact ──

  describe('updateContact', () => {
    it('updates contact properties', async () => {
      mockBasicApi.update.mockResolvedValueOnce({ id: '101' });

      const result = await client.updateContact('101', { id_oracle: 'ORACLE-456' });

      expect(result.ok).toBe(true);
      expect(mockBasicApi.update).toHaveBeenCalledWith('101', {
        properties: { id_oracle: 'ORACLE-456' },
      });
    });

    it('strips hs_object_id from properties before update', async () => {
      mockBasicApi.update.mockResolvedValueOnce({ id: '101' });

      await client.updateContact('101', {
        hs_object_id: '101',
        id_oracle: 'ORACLE-789',
      } as Record<string, string>);

      const sentProperties = mockBasicApi.update.mock.calls[0][1].properties;
      expect(sentProperties).not.toHaveProperty('hs_object_id');
      expect(sentProperties.id_oracle).toBe('ORACLE-789');
    });
  });

  // ── getDealById ──

  describe('getDealById', () => {
    it('returns deal with all properties', async () => {
      mockDealsBasicApi.getById.mockResolvedValueOnce({
        id: '201',
        properties: {
          dealname: 'Reserva Familia Pérez',
          check_in: '2026-07-01',
          check_out: '2026-07-05',
          room_type: 'Casitas',
          tipo_de_tarifa: 'Half Board',
          n_huespedes: '2',
          n_ninosas: '0',
          estado_de_reserva: 'Confirmada',
        },
      });

      const result = await client.getDealById('201');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.hs_object_id).toBe('201');
        expect(result.data.dealname).toBe('Reserva Familia Pérez');
        expect(result.data.check_in).toBe('2026-07-01');
        expect(result.data.room_type).toBe('Casitas');
      }
    });
  });

  // ── updateDeal ──

  describe('updateDeal', () => {
    it('updates deal with oracle IDs', async () => {
      mockDealsBasicApi.update.mockResolvedValueOnce({ id: '201' });

      const result = await client.updateDeal('201', {
        id_oracle: 'RES-001',
        'numero_de_reserva_': 'CONF-001',
      } as Record<string, string>);

      expect(result.ok).toBe(true);
      expect(mockDealsBasicApi.update).toHaveBeenCalledWith('201', {
        properties: {
          id_oracle: 'RES-001',
          'numero_de_reserva_': 'CONF-001',
        },
      });
    });
  });

  // ── getArchivedDealById ──

  describe('getArchivedDealById', () => {
    it('returns archived deal', async () => {
      mockDealsBasicApi.getById.mockResolvedValueOnce({
        id: '202',
        properties: { dealname: 'Cancelled Deal' },
      });

      const result = await client.getArchivedDealById('202');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data?.hs_object_id).toBe('202');
      }
      // Verify archived=true was passed
      expect(mockDealsBasicApi.getById).toHaveBeenCalledWith(
        '202',
        expect.any(Array),
        undefined,
        undefined,
        true,
      );
    });

    it('returns null when archived deal not found', async () => {
      mockDealsBasicApi.getById.mockRejectedValueOnce({ code: 404 });

      const result = await client.getArchivedDealById('999');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toBeNull();
      }
    });
  });

  // ── getCompanyById ──

  describe('getCompanyById', () => {
    it('returns company with properties', async () => {
      mockCompaniesBasicApi.getById.mockResolvedValueOnce({
        id: '301',
        properties: {
          name: 'Viajes Chile',
          tipo_de_empresa: 'Agencia',
          iata_code: 'IATA001',
          id_oracle: 'CORP-789',
        },
      });

      const result = await client.getCompanyById('301');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.hs_object_id).toBe('301');
        expect(result.data.name).toBe('Viajes Chile');
        expect(result.data.tipo_de_empresa).toBe('Agencia');
        expect(result.data.iata_code).toBe('IATA001');
      }
    });
  });

  // ── getAssociatedContacts ──

  describe('getAssociatedContacts', () => {
    it('returns contacts with labels', async () => {
      mockAssociationsV4BasicApi.getPage.mockResolvedValueOnce({
        results: [
          {
            toObjectId: 101,
            associationTypes: [{ label: 'Huésped Principal' }],
          },
          {
            toObjectId: 102,
            associationTypes: [{ label: 'Acompañante' }],
          },
        ],
      });

      const result = await client.getAssociatedContacts('201');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toHaveLength(2);
        expect(result.data[0].contactId).toBe('101');
        expect(result.data[0].labels).toEqual(['Huésped Principal']);
        expect(result.data[1].contactId).toBe('102');
        expect(result.data[1].labels).toEqual(['Acompañante']);
      }
      expect(mockAssociationsV4BasicApi.getPage).toHaveBeenCalledWith(
        'deal', '201', 'contact',
      );
    });

    it('handles associations without labels', async () => {
      mockAssociationsV4BasicApi.getPage.mockResolvedValueOnce({
        results: [
          {
            toObjectId: 103,
            associationTypes: [{ label: null }],
          },
        ],
      });

      const result = await client.getAssociatedContacts('201');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data[0].labels).toEqual([]);
      }
    });

    it('returns empty array when no contacts associated', async () => {
      mockAssociationsV4BasicApi.getPage.mockResolvedValueOnce({
        results: [],
      });

      const result = await client.getAssociatedContacts('201');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toEqual([]);
      }
    });
  });

  // ── getCompanyByDealId ──

  describe('getCompanyByDealId', () => {
    it('returns the associated company', async () => {
      mockAssociationsV4BasicApi.getPage.mockResolvedValueOnce({
        results: [{ toObjectId: 301, associationTypes: [] }],
      });
      mockCompaniesBasicApi.getById.mockResolvedValueOnce({
        id: '301',
        properties: {
          name: 'Viajes Chile',
          tipo_de_empresa: 'Agencia',
        },
      });

      const result = await client.getCompanyByDealId('201');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data?.name).toBe('Viajes Chile');
      }
      expect(mockAssociationsV4BasicApi.getPage).toHaveBeenCalledWith(
        'deal', '201', 'company',
      );
    });

    it('returns null when no company associated', async () => {
      mockAssociationsV4BasicApi.getPage.mockResolvedValueOnce({
        results: [],
      });

      const result = await client.getCompanyByDealId('201');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toBeNull();
      }
    });
  });

  // ── Error handling ──

  describe('error handling', () => {
    it('wraps rate limit errors correctly', async () => {
      mockBasicApi.getById.mockRejectedValueOnce({
        code: 429,
        body: { category: 'RATE_LIMIT', message: 'Too many requests' },
      });

      const result = await client.getContactById('101');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('HUBSPOT_RATE_LIMIT');
        expect(result.error.statusCode).toBe(429);
      }
    });

    it('wraps unknown errors', async () => {
      mockBasicApi.getById.mockRejectedValueOnce(new Error('Network failure'));

      const result = await client.getContactById('101');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('HUBSPOT_UNKNOWN');
        expect(result.error.message).toBe('Network failure');
      }
    });
  });
});
