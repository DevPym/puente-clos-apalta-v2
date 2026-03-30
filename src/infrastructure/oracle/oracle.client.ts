import axios from 'axios';
import type { AxiosInstance, AxiosError } from 'axios';
import { randomUUID } from 'node:crypto';
import type { IOracleClient } from '../../domain/ports/oracle.port.js';
import type { Result } from '../../domain/types/common.types.js';
import type {
  GuestProfile,
  CompanyProfile,
  OracleReservation,
  ReservationIds,
  OracleActivityBooking,
  OracleGuestMessage,
  OracleServiceRequest,
  OracleBillingCharge,
} from '../../domain/types/oracle.types.js';
import { OracleApiError } from '../../shared/errors/app.errors.js';
import type { ILogger } from '../../shared/logger/logger.js';
import type { OracleAuth } from './oracle.auth.js';

export interface OracleClientConfig {
  baseUrl: string;
  hotelId: string;
  appKey: string;
  externalSystem: string;
}

export class OracleClient implements IOracleClient {
  private readonly http: AxiosInstance;

  constructor(
    private readonly config: OracleClientConfig,
    private readonly auth: OracleAuth,
    private readonly logger: ILogger,
  ) {
    this.http = axios.create({
      baseURL: config.baseUrl,
      timeout: 30_000,
      headers: {
        'Content-Type': 'application/json;charset=UTF-8',
        'x-hotelid': config.hotelId,
        'x-app-key': config.appKey,
      },
    });
  }

  // ── Guest Profiles ──

  async createGuestProfile(profile: GuestProfile): Promise<Result<string, OracleApiError>> {
    const payload = this.buildGuestPayload(profile);
    return this.request('POST', '/crm/v1/guests', payload, (data) => {
      return this.extractProfileId(data);
    });
  }

  async updateGuestProfile(oracleId: string, profile: Partial<GuestProfile>): Promise<Result<void, OracleApiError>> {
    const payload = this.buildProfilePayload(profile);
    return this.request('PUT', `/crm/v1/profiles/${oracleId}`, payload, () => undefined);
  }

  async getGuestProfile(oracleId: string): Promise<Result<GuestProfile, OracleApiError>> {
    return this.request('GET', `/crm/v1/guests/${oracleId}`, undefined, (data) => {
      return this.parseGuestProfile(data);
    });
  }

  // ── Company Profiles ──

  async createCompanyProfile(profile: CompanyProfile): Promise<Result<string, OracleApiError>> {
    const payload = this.buildCompanyPayload(profile);
    return this.request('POST', '/crm/v1/companies', payload, (data) => {
      return this.extractProfileId(data);
    });
  }

  async updateCompanyProfile(oracleId: string, profile: Partial<CompanyProfile>): Promise<Result<void, OracleApiError>> {
    const payload = this.buildCompanyProfilePayload(profile);
    return this.request('PUT', `/crm/v1/profiles/${oracleId}`, payload, () => undefined);
  }

  // ── Reservations ──

  async createReservation(reservation: OracleReservation): Promise<Result<ReservationIds, OracleApiError>> {
    const payload = this.buildReservationPayload(reservation);
    const hotelId = this.config.hotelId;
    return this.request('POST', `/rsv/v1/hotels/${hotelId}/reservations`, payload, (data) => {
      return this.extractReservationIds(data);
    });
  }

  async updateReservation(oracleId: string, reservation: Partial<OracleReservation>): Promise<Result<ReservationIds, OracleApiError>> {
    const payload = this.buildReservationPayload(reservation);
    const hotelId = this.config.hotelId;
    return this.request('PUT', `/rsv/v1/hotels/${hotelId}/reservations/${oracleId}`, payload, (data) => {
      return this.extractReservationIds(data);
    });
  }

  async getReservation(oracleId: string): Promise<Result<OracleReservation, OracleApiError>> {
    const hotelId = this.config.hotelId;
    return this.request('GET', `/rsv/v1/hotels/${hotelId}/reservations/${oracleId}`, undefined, (data) => {
      return data as OracleReservation;
    });
  }

  async cancelReservation(oracleId: string, reasonCode: string): Promise<Result<string | null, OracleApiError>> {
    const hotelId = this.config.hotelId;
    const payload = { reason: { code: reasonCode } };
    return this.request('POST', `/rsv/v1/hotels/${hotelId}/reservations/${oracleId}/cancellations`, payload, (data) => {
      if (data && typeof data === 'object' && 'cancellationNumber' in data) {
        return (data as { cancellationNumber: string }).cancellationNumber;
      }
      return null;
    });
  }

  // ── Leisure Management (Activity Bookings) ──

  async createActivityBooking(booking: OracleActivityBooking): Promise<Result<string, OracleApiError>> {
    const hotelId = this.config.hotelId;
    const payload = {
      activityBooking: {
        hotelId: booking.hotelId,
        reservationId: { id: booking.reservationId, type: 'Reservation' },
        profileId: { id: booking.profileId, type: 'Profile' },
        activities: [{
          type: booking.activityType,
          status: booking.status,
        }],
      },
    };
    return this.request('POST', `/act/v1/hotels/${hotelId}/reservations/${booking.reservationId}/activityBookings`, payload, (data) => {
      return this.extractId(data, 'activityBookingId');
    });
  }

  async updateActivityBooking(bookingId: string, booking: Partial<OracleActivityBooking>): Promise<Result<void, OracleApiError>> {
    const hotelId = this.config.hotelId;
    const reservationId = booking.reservationId ?? bookingId;
    const payload = {
      activityBooking: {
        hotelId: booking.hotelId ?? hotelId,
        activities: [{
          ...(booking.activityType && { type: booking.activityType }),
          ...(booking.status && { status: booking.status }),
        }],
      },
    };
    return this.request('PUT', `/act/v1/hotels/${hotelId}/reservations/${reservationId}/activityBookings`, payload, () => undefined);
  }

  // ── Guest Messages ──

  async createGuestMessage(message: OracleGuestMessage): Promise<Result<string, OracleApiError>> {
    const hotelId = this.config.hotelId;
    const payload = {
      guestMessages: [{
        message: message.messageText,
        ...(message.messageType && { messageType: message.messageType }),
      }],
      reservationId: { id: message.reservationId, type: 'Reservation' },
    };
    return this.request('POST', `/fof/v1/hotels/${hotelId}/guestMessages`, payload, (data) => {
      return this.extractId(data, 'guestMessageId');
    });
  }

  // ── Service Requests ──

  async createServiceRequest(request: OracleServiceRequest): Promise<Result<string, OracleApiError>> {
    const hotelId = this.config.hotelId;
    const payload = {
      serviceRequest: {
        description: request.description,
        ...(request.roomId && { roomId: request.roomId }),
        reservationId: { id: request.reservationId, type: 'Reservation' },
      },
    };
    return this.request('POST', `/fof/v1/hotels/${hotelId}/serviceRequests`, payload, (data) => {
      return this.extractId(data, 'serviceRequestId');
    });
  }

  async updateServiceRequest(requestId: string, request: Partial<OracleServiceRequest>): Promise<Result<void, OracleApiError>> {
    const hotelId = this.config.hotelId;
    const payload = {
      serviceRequest: {
        ...(request.description && { description: request.description }),
        ...(request.roomId && { roomId: request.roomId }),
      },
    };
    return this.request('PUT', `/fof/v1/hotels/${hotelId}/serviceRequests/${requestId}`, payload, () => undefined);
  }

  // ── Cashiering ──

  async postBillingCharge(charge: OracleBillingCharge): Promise<Result<void, OracleApiError>> {
    const hotelId = this.config.hotelId;
    const payload = {
      charges: [{
        transactionCode: charge.transactionCode,
        postingRemark: charge.description,
        ...(charge.amount && {
          price: { amount: Number(charge.amount), currencyCode: 'CLP' },
        }),
        postingQuantity: 1,
      }],
      reservationId: { id: charge.reservationId, type: 'Reservation' },
    };
    return this.request('POST', `/csh/v1/hotels/${hotelId}/charges`, payload, () => undefined);
  }

  // ── Private helpers ──

  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    payload: unknown,
    transform: (data: unknown) => T,
  ): Promise<Result<T, OracleApiError>> {
    const startMs = Date.now();
    try {
      const token = await this.auth.getToken();
      const response = await this.http.request({
        method,
        url: path,
        data: method !== 'GET' ? payload : undefined,
        headers: {
          Authorization: `Bearer ${token}`,
          'x-request-id': randomUUID(),
        },
      });

      this.logger.info('Oracle API call succeeded', {
        method,
        path,
        status: response.status,
        durationMs: Date.now() - startMs,
      });


      return { ok: true, data: transform(response.data) };
    } catch (err) {
      const oracleError = this.handleError(err, method, path, Date.now() - startMs);

      // If 401, try one token refresh and retry
      if (oracleError.statusCode === 401) {
        try {
          this.auth.invalidateToken();
          const newToken = await this.auth.refreshToken();
          const response = await this.http.request({
            method,
            url: path,
            data: method !== 'GET' ? payload : undefined,
            headers: {
              Authorization: `Bearer ${newToken}`,
              'x-request-id': randomUUID(),
            },
          });
          this.logger.info('Oracle API call succeeded after token refresh', { method, path });
          return { ok: true, data: transform(response.data) };
        } catch (retryErr) {
          const retryError = this.handleError(retryErr, method, path, Date.now() - startMs);
          return { ok: false, error: retryError };
        }
      }

      return { ok: false, error: oracleError };
    }
  }

  private handleError(err: unknown, method: string, path: string, durationMs: number): OracleApiError {
    if (axios.isAxiosError(err)) {
      const axiosErr = err as AxiosError<{ title?: string; 'o:errorCode'?: string; detail?: string; status?: number; 'o:errorPath'?: string; 'o:errorDetails'?: unknown }>;
      const status = axiosErr.response?.status ?? 0;
      const data = axiosErr.response?.data;
      const errorCode = data?.['o:errorCode'] ?? `${status}`;
      const detail = data?.detail ?? data?.title ?? axiosErr.message;

      this.logger.error(`Oracle API call failed: ${method} ${path} → ${status} ${errorCode}: ${detail}`);
      console.error('Oracle error response body:', JSON.stringify(data, null, 2));

      return new OracleApiError(detail, errorCode, status, {
        method,
        path,
        durationMs,
        responseBody: data,
      });
    }

    // Network errors (ECONNREFUSED, ETIMEDOUT, etc.)
    const message = err instanceof Error ? err.message : 'Unknown Oracle error';
    const code = err instanceof Error && 'code' in err ? String((err as NodeJS.ErrnoException).code) : 'NETWORK';

    this.logger.error(`Oracle API network error: ${method} ${path} → ${code}: ${message}`);
    console.error(err);

    return new OracleApiError(message, code, 0, { method, path, durationMs });
  }

  // POST /crm/v1/guests — uses "guest" schema with guestDetails.customer.personName[]
  private buildGuestPayload(profile: Partial<GuestProfile>): Record<string, unknown> {
    const personName: Record<string, unknown> = {
      ...(profile.givenName && { givenName: profile.givenName }),
      ...(profile.surname && { surname: profile.surname }),
      ...(profile.namePrefix && { namePrefix: profile.namePrefix }),
      nameType: 'PRIMARY',
    };

    const customer: Record<string, unknown> = {
      personName: [personName],
      ...(profile.birthDate && { birthDate: profile.birthDate }),
      ...(profile.vipCode && { vipStatus: profile.vipCode }),
      ...(profile.language && { language: profile.language }),
      ...(profile.nationality && { nationality: profile.nationality }),
    };

    if (profile.identifications && profile.identifications.length > 0) {
      customer.identifications = {
        identificationInfo: profile.identifications.map((id) => ({
          identification: { idType: id.idType, idNumber: id.idNumber },
        })),
      };
    }

    const guestDetails: Record<string, unknown> = { customer };

    if (profile.email) {
      guestDetails.emails = { emailInfo: [{ email: { emailAddress: profile.email } }] };
    }

    const phones = this.buildPhones(profile.phoneNumber, profile.mobileNumber);
    if (phones.length > 0) {
      guestDetails.telephones = { telephoneInfo: phones };
    }

    if (profile.address) {
      guestDetails.addresses = {
        addressInfo: [{ address: this.buildAddress(profile.address) }],
      };
    }

    return { guestDetails };
  }

  // PUT /crm/v1/profiles/{id} — uses "profile" schema with profileDetails.customer.personName[]
  private buildProfilePayload(profile: Partial<GuestProfile>): Record<string, unknown> {
    const personName: Record<string, unknown> = {
      ...(profile.givenName && { givenName: profile.givenName }),
      ...(profile.surname && { surname: profile.surname }),
      ...(profile.namePrefix && { namePrefix: profile.namePrefix }),
      nameType: 'PRIMARY',
    };

    const customer: Record<string, unknown> = {
      personName: [personName],
      ...(profile.birthDate && { birthDate: profile.birthDate }),
      ...(profile.vipCode && { vipStatus: profile.vipCode }),
      ...(profile.language && { language: profile.language }),
      ...(profile.nationality && { nationality: profile.nationality }),
    };

    if (profile.identifications && profile.identifications.length > 0) {
      customer.identifications = {
        identificationInfo: profile.identifications.map((id) => ({
          identification: { idType: id.idType, idNumber: id.idNumber },
        })),
      };
    }

    const profileDetails: Record<string, unknown> = { customer };

    if (profile.email) {
      profileDetails.emails = { emailInfo: [{ email: { emailAddress: profile.email } }] };
    }

    const phones = this.buildPhones(profile.phoneNumber, profile.mobileNumber);
    if (phones.length > 0) {
      profileDetails.telephones = { telephoneInfo: phones };
    }

    if (profile.address) {
      profileDetails.addresses = {
        addressInfo: [{ address: this.buildAddress(profile.address) }],
      };
    }

    return { profileDetails };
  }

  // POST /crm/v1/companies — uses "company" schema with companyDetails
  private buildCompanyPayload(profile: Partial<CompanyProfile>): Record<string, unknown> {
    const companyDetails: Record<string, unknown> = {
      ...(profile.companyName && { company: { companyName: profile.companyName } }),
      ...(profile.profileType && { profileType: profile.profileType }),
      ...(profile.iataCode && { iATAInfo: { iATACompany: profile.iataCode } }),
      ...(profile.contactName && { contactName: profile.contactName }),
    };

    if (profile.email) {
      companyDetails.emails = { emailInfo: [{ email: { emailAddress: profile.email } }] };
    }

    if (profile.phoneNumber) {
      companyDetails.telephones = {
        telephoneInfo: [{ telephone: { phoneTechType: 'PHONE', phoneNumber: profile.phoneNumber } }],
      };
    }

    return { companyDetails };
  }

  // PUT /crm/v1/profiles/{id} — uses "profile" schema with profileDetails for company updates
  private buildCompanyProfilePayload(profile: Partial<CompanyProfile>): Record<string, unknown> {
    const profileDetails: Record<string, unknown> = {
      ...(profile.companyName && { company: { companyName: profile.companyName } }),
      ...(profile.profileType && { profileType: profile.profileType }),
      ...(profile.iataCode && { iATAInfo: { iATACompany: profile.iataCode } }),
      ...(profile.contactName && { contactName: profile.contactName }),
    };

    if (profile.email) {
      profileDetails.emails = { emailInfo: [{ email: { emailAddress: profile.email } }] };
    }

    if (profile.phoneNumber) {
      profileDetails.telephones = {
        telephoneInfo: [{ telephone: { phoneTechType: 'PHONE', phoneNumber: profile.phoneNumber } }],
      };
    }

    return { profileDetails };
  }

  private buildPhones(phone?: string, mobile?: string): Array<Record<string, unknown>> {
    const phones: Array<Record<string, unknown>> = [];
    if (phone) phones.push({ telephone: { phoneTechType: 'PHONE', phoneNumber: phone } });
    if (mobile) phones.push({ telephone: { phoneTechType: 'MOBILE', phoneNumber: mobile } });
    return phones;
  }

  private buildAddress(address: GuestProfile['address']): Record<string, unknown> {
    if (!address) return {};
    return {
      addressLine: address.addressLine,
      ...(address.cityName && { cityName: address.cityName }),
      ...(address.postalCode && { postalCode: address.postalCode }),
      ...(address.state && { state: address.state }),
      ...(address.countryCode && { country: { code: address.countryCode } }),
    };
  }

  private buildReservationPayload(reservation: Partial<OracleReservation>): Record<string, unknown> {
    const roomStay: Record<string, unknown> = {};

    if (reservation.arrivalDate || reservation.departureDate || reservation.roomType || reservation.ratePlanCode) {
      roomStay.roomRates = [{
        ...(reservation.roomType && { roomType: reservation.roomType }),
        ...(reservation.ratePlanCode && { ratePlanCode: reservation.ratePlanCode }),
        ...(reservation.amountBeforeTax && {
          total: { amountBeforeTax: reservation.amountBeforeTax, currencyCode: reservation.currencyCode ?? 'CLP' },
        }),
      }];
    }

    if (reservation.arrivalDate) roomStay.arrivalDate = reservation.arrivalDate;
    if (reservation.departureDate) roomStay.departureDate = reservation.departureDate;
    if (reservation.numberOfRooms !== undefined) roomStay.numberOfRooms = reservation.numberOfRooms;
    if (reservation.roomId) roomStay.roomId = reservation.roomId;

    if (reservation.adults !== undefined || reservation.children !== undefined) {
      roomStay.guestCounts = {
        ...(reservation.adults !== undefined && { adults: reservation.adults }),
        ...(reservation.children !== undefined && { children: reservation.children }),
      };
    }

    const payload: Record<string, unknown> = {
      reservations: {
        reservation: {
          roomStay,
          ...(reservation.reservationStatus && { reservationStatus: reservation.reservationStatus }),
          ...(reservation.comments && { comments: [{ text: reservation.comments }] }),
          ...(reservation.isPseudoRoom !== undefined && { pseudoRoom: reservation.isPseudoRoom }),
        },
      },
    };

    const res = (payload.reservations as Record<string, unknown>).reservation as Record<string, unknown>;

    if (reservation.guestProfiles && reservation.guestProfiles.length > 0) {
      res.reservationGuests = reservation.guestProfiles.map((g) => ({
        profileId: { id: g.oracleProfileId, type: 'Profile' },
        primary: g.isPrimary,
      }));
    }

    if (reservation.travelAgentId) {
      res.travelAgent = { profileId: { id: reservation.travelAgentId, type: 'CorporateId' } };
    }

    if (reservation.sourceCode) {
      res.sourceOfSale = {
        sourceCode: reservation.sourceCode,
        sourceType: reservation.sourceType ?? 'PMS',
      };
    }

    if (reservation.paymentMethod) {
      res.cashiering = { paymentMethod: reservation.paymentMethod };
    }

    return payload;
  }

  private extractProfileId(data: unknown): string {
    if (data && typeof data === 'object') {
      const d = data as Record<string, unknown>;
      if (typeof d.profileId === 'string') return d.profileId;
      // Try ID lists: guestIdList, companyIdList, profileIdList
      const idLists = ['profileIdList', 'guestIdList', 'companyIdList'] as const;
      for (const listKey of idLists) {
        if (Array.isArray(d[listKey])) {
          for (const item of d[listKey] as unknown[]) {
            if (typeof item === 'object' && item !== null) {
              const entry = item as Record<string, unknown>;
              if (entry.type === 'Profile' && typeof entry.id === 'string') return entry.id;
            }
          }
        }
      }
      // Fallback: extract from HATEOAS links (rel="self" href)
      if (Array.isArray(d.links)) {
        for (const link of d.links as unknown[]) {
          if (typeof link === 'object' && link !== null) {
            const l = link as Record<string, unknown>;
            if (l.rel === 'self' && typeof l.href === 'string') {
              const segments = l.href.split('/');
              const id = segments[segments.length - 1];
              if (id) return id;
            }
          }
        }
      }
    }
    throw new Error('Could not extract profile ID from Oracle response');
  }

  private extractReservationIds(data: unknown): ReservationIds {
    const ids: ReservationIds = { internalId: '' };
    if (data && typeof data === 'object') {
      const d = data as Record<string, unknown>;
      if (Array.isArray(d.reservationIdList)) {
        for (const item of d.reservationIdList) {
          if (typeof item === 'object' && item !== null) {
            const entry = item as Record<string, unknown>;
            if (typeof entry.type === 'string' && typeof entry.id === 'string') {
              if (entry.type === 'Reservation') ids.internalId = entry.id;
              if (entry.type === 'Confirmation') ids.confirmationId = entry.id;
              if (entry.type === 'CancellationNumber') ids.cancellationId = entry.id;
            }
          }
        }
      }
    }
    if (!ids.internalId) throw new Error('Could not extract reservation ID from Oracle response');
    return ids;
  }

  private extractId(data: unknown, key: string): string {
    if (data && typeof data === 'object') {
      const d = data as Record<string, unknown>;
      if (typeof d[key] === 'string') return d[key];
    }
    throw new Error(`Could not extract ${key} from Oracle response`);
  }

  private parseGuestProfile(data: unknown): GuestProfile {
    // Return the raw data for now — full parsing will be refined in Sprint 4
    // when the contact mapper needs to handle Oracle→HubSpot direction
    const d = data as Record<string, unknown>;
    const details = (d.guestDetails ?? d) as Record<string, unknown>;
    const customer = (details.customer ?? {}) as Record<string, unknown>;

    return {
      givenName: String(customer.givenName ?? ''),
      surname: String(customer.surname ?? ''),
    };
  }
}
