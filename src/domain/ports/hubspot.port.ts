import type { Result } from '../types/common.types.js';
import type {
  HsContact,
  HsCompany,
  HsDeal,
  HsAppointment,
  DealContactAssociation,
} from '../types/hubspot.types.js';
import type { HubSpotApiError } from '../../shared/errors/app.errors.js';

export interface IHubSpotClient {
  // ── Contacts ──
  getContactById(contactId: string): Promise<Result<HsContact, HubSpotApiError>>;
  updateContact(contactId: string, properties: Partial<HsContact>): Promise<Result<void, HubSpotApiError>>;

  // ── Deals ──
  getDealById(dealId: string): Promise<Result<HsDeal, HubSpotApiError>>;
  updateDeal(dealId: string, properties: Partial<HsDeal>): Promise<Result<void, HubSpotApiError>>;
  getArchivedDealById(dealId: string): Promise<Result<HsDeal | null, HubSpotApiError>>;

  // ── Companies ──
  getCompanyById(companyId: string): Promise<Result<HsCompany, HubSpotApiError>>;
  updateCompany(companyId: string, properties: Partial<HsCompany>): Promise<Result<void, HubSpotApiError>>;

  // ── Appointments (objectTypeId 0-421) ──
  getAppointmentById(appointmentId: string): Promise<Result<HsAppointment, HubSpotApiError>>;
  getAssociatedDealForAppointment(appointmentId: string): Promise<Result<string | null, HubSpotApiError>>;

  // ── Associations ──
  getAssociatedContacts(dealId: string): Promise<Result<DealContactAssociation[], HubSpotApiError>>;
  getCompanyByDealId(dealId: string): Promise<Result<HsCompany | null, HubSpotApiError>>;
}
