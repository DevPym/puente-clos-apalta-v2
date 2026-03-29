// ── Guest Profile (CRM API) ──

export interface OracleAddress {
  addressLine: string[];     // max 4 lines, each max 80 chars
  cityName?: string;         // max 40
  postalCode?: string;       // max 15
  state?: string;            // max 20
  countryCode?: string;      // ISO 2-letter
}

export interface OracleIdentification {
  idType: string;            // 'PASSPORT' | 'TAX_ID' | etc.
  idNumber: string;
}

export interface GuestProfile {
  givenName: string;         // max 40
  surname: string;           // max 40
  email?: string;
  phoneNumber?: string;      // max 40
  mobileNumber?: string;     // max 40
  language?: string;         // pattern: [a-zA-Z]{1,8}
  nationality?: string;      // ISO country code
  birthDate?: string;        // ISO date
  address?: OracleAddress;
  namePrefix?: string;       // Mr., Mrs., etc.
  vipCode?: string;
  identifications?: OracleIdentification[];
  allergies?: string;
}

// ── Company Profile (CRM API) ──

export type OracleProfileType = 'Company' | 'TravelAgent';

export interface CompanyProfile {
  companyName: string;       // max 40
  profileType: OracleProfileType;
  iataCode?: string;         // max 20
  email?: string;
  phoneNumber?: string;
  contactName?: string;
}

// ── Reservation (Reservations API) ──

export type OracleResStatus = 'Reserved' | 'InHouse' | 'CheckedOut' | 'Cancelled';

export interface ReservationGuest {
  oracleProfileId: string;
  isPrimary: boolean;
}

export interface OracleReservation {
  arrivalDate: string;           // ISO date
  departureDate: string;         // ISO date
  roomType: string;              // max 20
  ratePlanCode: string;          // max 20
  adults: number;
  children: number;
  numberOfRooms: number;
  roomId?: string;               // max 20
  guestProfiles: ReservationGuest[];
  travelAgentId?: string;
  sourceCode: string;
  sourceType: string;            // default "PMS"
  reservationStatus: OracleResStatus;
  paymentMethod?: string;
  isPseudoRoom: boolean;
  currencyCode: string;          // ISO 4217, default "CLP"
  amountBeforeTax?: string;      // Oracle uses string for amounts
  comments?: string;
}

export interface ReservationIds {
  internalId: string;            // reservationIdList[type="Reservation"].id
  confirmationId?: string;       // reservationIdList[type="Confirmation"].id
  cancellationId?: string;       // reservationIdList[type="CancellationNumber"].id
}

export interface OracleProfileId {
  id: string;
  type: 'Profile' | 'CorporateId';
}

// ── Appointment: Leisure Management ──

export type ActivityBookingStatus = 'Pending' | 'Completed' | 'Cancelled';

export interface OracleActivityBooking {
  activityType: string;
  status: ActivityBookingStatus;
  profileId: string;
  reservationId: string;
  hotelId: string;
}

// ── Appointment: Guest Messages ──

export interface OracleGuestMessage {
  messageText: string;
  messageType?: string;
  reservationId: string;
  hotelId: string;
}

// ── Appointment: Service Requests ──

export interface OracleServiceRequest {
  description: string;
  roomId?: string;
  reservationId: string;
  hotelId: string;
}

// ── Appointment: Cashiering ──

export interface OracleBillingCharge {
  transactionCode: string;
  description: string;
  amount?: string;
  reservationId: string;
  hotelId: string;
}
