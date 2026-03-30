import type { Result } from '../types/common.types.js';
import type {
  GuestProfile,
  CompanyProfile,
  OracleReservation,
  ReservationIds,
  OracleActivityBooking,
  OracleGuestMessage,
  OracleServiceRequest,
  OracleBillingCharge,
} from '../types/oracle.types.js';
import type { OracleApiError } from '../../shared/errors/app.errors.js';

export interface IOracleClient {
  // ── Guest Profiles ──
  createGuestProfile(profile: GuestProfile): Promise<Result<string, OracleApiError>>;
  updateGuestProfile(oracleId: string, profile: Partial<GuestProfile>): Promise<Result<void, OracleApiError>>;
  getGuestProfile(oracleId: string): Promise<Result<GuestProfile, OracleApiError>>;

  // ── Company / TravelAgent Profiles ──
  createCompanyProfile(profile: CompanyProfile): Promise<Result<string, OracleApiError>>;
  updateCompanyProfile(oracleId: string, profile: Partial<CompanyProfile>): Promise<Result<void, OracleApiError>>;

  // ── Reservations ──
  createReservation(reservation: OracleReservation): Promise<Result<ReservationIds, OracleApiError>>;
  updateReservation(oracleId: string, reservation: Partial<OracleReservation>): Promise<Result<ReservationIds, OracleApiError>>;
  getReservation(oracleId: string): Promise<Result<OracleReservation, OracleApiError>>;
  cancelReservation(oracleId: string, reasonCode: string): Promise<Result<string | null, OracleApiError>>;

  // ── Appointment: Leisure Management ──
  createActivityBooking(booking: OracleActivityBooking): Promise<Result<string, OracleApiError>>;
  updateActivityBooking(bookingId: string, booking: Partial<OracleActivityBooking>): Promise<Result<void, OracleApiError>>;

  // ── Appointment: Guest Messages ──
  createGuestMessage(message: OracleGuestMessage): Promise<Result<string, OracleApiError>>;

  // ── Appointment: Service Requests ──
  createServiceRequest(request: OracleServiceRequest): Promise<Result<string, OracleApiError>>;
  updateServiceRequest(requestId: string, request: Partial<OracleServiceRequest>): Promise<Result<void, OracleApiError>>;

  // ── Appointment: Cashiering ──
  postBillingCharge(charge: OracleBillingCharge): Promise<Result<void, OracleApiError>>;

  // ── Debug ──
  rawGet(path: string): Promise<Result<unknown, OracleApiError>>;
  rawPut(path: string, payload: unknown): Promise<Result<unknown, OracleApiError>>;
}
