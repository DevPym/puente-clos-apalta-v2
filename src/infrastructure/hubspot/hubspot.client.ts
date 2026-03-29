import { Client } from '@hubspot/api-client';
import type { IHubSpotClient } from '../../domain/ports/hubspot.port.js';
import type { Result } from '../../domain/types/common.types.js';
import type {
  HsContact,
  HsCompany,
  HsDeal,
  DealContactAssociation,
} from '../../domain/types/hubspot.types.js';
import { HubSpotApiError } from '../../shared/errors/app.errors.js';
import type { ILogger } from '../../shared/logger/logger.js';

export interface HubSpotClientConfig {
  accessToken: string;
}

// Properties to fetch for each object type
const CONTACT_PROPERTIES = [
  'hs_object_id', 'firstname', 'lastname', 'email', 'phone', 'mobilephone',
  'address', 'city', 'fecha_de_nacimiento', 'hs_language', 'pais',
  'pasaporte', 'rut', 'huesped_vip', 'allergies', 'id_oracle',
];

const DEAL_PROPERTIES = [
  'hs_object_id', 'dealname', 'createdate', 'check_in', 'check_out',
  'room_type', 'tipo_de_tarifa', 'n_huespedes', 'n_ninosas',
  'cantidad_de_habitaciones', 'n_habitacion', 'estado_de_reserva',
  'fuente_de_reserva', 'tipo_de_pago', 'agencia_de_viajes',
  'es_pseudo_room', 'comentarios_del_huesped', 'id_oracle',
  'numero_de_reserva_', 'id_synxis',
];

const COMPANY_PROPERTIES = [
  'hs_object_id', 'name', 'domain', 'phone', 'email_agencia',
  'nombre_agente', 'tipo_de_empresa', 'iata_code', 'id_oracle',
  'hs_parent_company_id',
];

export class HubSpotClient implements IHubSpotClient {
  private readonly client: Client;

  constructor(
    config: HubSpotClientConfig,
    private readonly logger: ILogger,
  ) {
    this.client = new Client({ accessToken: config.accessToken });
  }

  // ── Contacts ──

  async getContactById(contactId: string): Promise<Result<HsContact, HubSpotApiError>> {
    return this.execute('getContactById', async () => {
      const response = await this.client.crm.contacts.basicApi.getById(
        contactId,
        CONTACT_PROPERTIES,
      );
      return { hs_object_id: response.id, ...response.properties } as HsContact;
    });
  }

  async updateContact(contactId: string, properties: Partial<HsContact>): Promise<Result<void, HubSpotApiError>> {
    return this.execute('updateContact', async () => {
      const { hs_object_id: _, ...props } = properties;
      await this.client.crm.contacts.basicApi.update(contactId, {
        properties: props as Record<string, string>,
      });
    });
  }

  // ── Deals ──

  async getDealById(dealId: string): Promise<Result<HsDeal, HubSpotApiError>> {
    return this.execute('getDealById', async () => {
      const response = await this.client.crm.deals.basicApi.getById(
        dealId,
        DEAL_PROPERTIES,
      );
      return { hs_object_id: response.id, ...response.properties } as HsDeal;
    });
  }

  async updateDeal(dealId: string, properties: Partial<HsDeal>): Promise<Result<void, HubSpotApiError>> {
    return this.execute('updateDeal', async () => {
      const { hs_object_id: _, ...props } = properties;
      await this.client.crm.deals.basicApi.update(dealId, {
        properties: props as Record<string, string>,
      });
    });
  }

  async getArchivedDealById(dealId: string): Promise<Result<HsDeal | null, HubSpotApiError>> {
    return this.execute('getArchivedDealById', async () => {
      try {
        const response = await this.client.crm.deals.basicApi.getById(
          dealId,
          DEAL_PROPERTIES,
          undefined, // propertiesWithHistory
          undefined, // associations
          true,      // archived
        );
        return { hs_object_id: response.id, ...response.properties } as HsDeal;
      } catch (err: unknown) {
        if (this.isHubSpotError(err) && err.code === 404) return null;
        throw err;
      }
    });
  }

  // ── Companies ──

  async getCompanyById(companyId: string): Promise<Result<HsCompany, HubSpotApiError>> {
    return this.execute('getCompanyById', async () => {
      const response = await this.client.crm.companies.basicApi.getById(
        companyId,
        COMPANY_PROPERTIES,
      );
      return { hs_object_id: response.id, ...response.properties } as HsCompany;
    });
  }

  async updateCompany(companyId: string, properties: Partial<HsCompany>): Promise<Result<void, HubSpotApiError>> {
    return this.execute('updateCompany', async () => {
      const { hs_object_id: _, ...props } = properties;
      await this.client.crm.companies.basicApi.update(companyId, {
        properties: props as Record<string, string>,
      });
    });
  }

  // ── Associations ──

  async getAssociatedContacts(dealId: string): Promise<Result<DealContactAssociation[], HubSpotApiError>> {
    return this.execute('getAssociatedContacts', async () => {
      const response = await this.client.crm.associations.v4.basicApi.getPage(
        'deal',
        dealId,
        'contact',
      );

      return response.results.map((assoc) => ({
        contactId: String(assoc.toObjectId),
        labels: (assoc.associationTypes ?? [])
          .map((t) => t.label)
          .filter((l): l is string => l != null),
      }));
    });
  }

  async getCompanyByDealId(dealId: string): Promise<Result<HsCompany | null, HubSpotApiError>> {
    return this.execute('getCompanyByDealId', async () => {
      const response = await this.client.crm.associations.v4.basicApi.getPage(
        'deal',
        dealId,
        'company',
      );

      if (response.results.length === 0) return null;

      const companyId = String(response.results[0].toObjectId);
      const companyResponse = await this.client.crm.companies.basicApi.getById(
        companyId,
        COMPANY_PROPERTIES,
      );
      return { hs_object_id: companyResponse.id, ...companyResponse.properties } as HsCompany;
    });
  }

  // ── Private helpers ──

  private async execute<T>(operation: string, fn: () => Promise<T>): Promise<Result<T, HubSpotApiError>> {
    const startMs = Date.now();
    try {
      const data = await fn();
      this.logger.info('HubSpot API call succeeded', {
        operation,
        durationMs: Date.now() - startMs,
      });
      return { ok: true, data };
    } catch (err: unknown) {
      const hsError = this.handleError(err, operation, Date.now() - startMs);
      return { ok: false, error: hsError };
    }
  }

  private handleError(err: unknown, operation: string, durationMs: number): HubSpotApiError {
    if (this.isHubSpotError(err)) {
      const status = err.code ?? 0;
      const category = err.body?.category ?? `${status}`;
      const message = err.body?.message ?? err.message ?? 'HubSpot API error';

      this.logger.error('HubSpot API call failed', {
        operation,
        status,
        category,
        message,
        durationMs,
      });

      return new HubSpotApiError(message, category, status);
    }

    const message = err instanceof Error ? err.message : 'Unknown HubSpot error';
    this.logger.error('HubSpot API unexpected error', { operation, message, durationMs });
    return new HubSpotApiError(message, 'UNKNOWN', 0);
  }

  private isHubSpotError(err: unknown): err is { code: number; body?: { category?: string; message?: string }; message?: string } {
    return typeof err === 'object' && err !== null && 'code' in err;
  }
}
