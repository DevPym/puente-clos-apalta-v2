import { Client } from '@hubspot/api-client';
import type { IHubSpotClient } from '../../domain/ports/hubspot.port.js';
import type { Result } from '../../domain/types/common.types.js';
import type {
  HsContact,
  HsCompany,
  HsDeal,
  HsAppointment,
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
  'hs_object_id', 'dealname', 'createdate',
  'check_in', 'check_out', 'room_type', 'tipo_de_tarifa',
  'n_huespedes', 'n_ninosas', 'estado_de_reserva', 'tipo_de_pago',
  'id_oracle', 'numero_de_reserva_', 'confirmation_number__oracle', 'id_synxis',
];

const COMPANY_PROPERTIES = [
  'hs_object_id', 'name', 'domain', 'phone', 'email_agencia',
  'nombre_agente', 'tipo_de_empresa', 'iata_code', 'id_oracle',
  'hs_parent_company_id',
];

// Appointments (objectTypeId 0-421) — todas las propiedades del registro diario
const APPOINTMENT_OBJECT_TYPE = '0-421';
const APPOINTMENT_PROPERTIES = [
  'hs_object_id', 'dealname', 'numero_de_reserva_',
  'actividades_pendientes_o_reservadas', 'actividades_realizadas',
  'comentarios_del_huesped', 'descripcion_de_la_incidencia', 'cambios_dieteticos',
  'estado_de_animo_general', 'feedback_espontaneo', 'observaciones_de_mejora',
  'tipo_de_incidencia', 'estado_incidencia', 'responsable_asignado',
  'comentarios_mantencion', 'comentarios_mantencion_habitacion', 'observaciones_de_la_habitacion',
  'nombre_housekeeping', 'tareas_realizadas', 'velocidad_del_servicio',
  'descripcion_desayuno_consumido', 'descripcion_almuerzo_consumido', 'descripcion_cena_consumida',
  'snacks__bebidas_adicionales', 'servicios_utilizados', 'gastos_adicionales_del_dia',
  'tienda_le_club', 'nivel_de_satisfaccion_actividades', 'preferencia_de_horario', 'room_type',
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

  // ── Appointments (objectTypeId 0-421) ──

  async getAppointmentById(appointmentId: string): Promise<Result<HsAppointment, HubSpotApiError>> {
    return this.execute('getAppointmentById', async () => {
      const response = await this.client.crm.objects.basicApi.getById(
        APPOINTMENT_OBJECT_TYPE,
        appointmentId,
        APPOINTMENT_PROPERTIES,
      );
      return { hs_object_id: response.id, ...response.properties } as HsAppointment;
    });
  }

  async getAssociatedDealForAppointment(appointmentId: string): Promise<Result<string | null, HubSpotApiError>> {
    return this.execute('getAssociatedDealForAppointment', async () => {
      const response = await this.client.crm.associations.v4.basicApi.getPage(
        APPOINTMENT_OBJECT_TYPE,
        appointmentId,
        'deal',
      );
      if (response.results.length === 0) return null;
      return String(response.results[0].toObjectId);
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
