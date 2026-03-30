import type { OracleResStatus, OracleProfileType } from './oracle.types.js';

// ── Reservation Status ──

export const ReservationStatusMap: Record<string, OracleResStatus> = {
  'Confirmada': 'Reserved',
  'Hospedado': 'InHouse',
  'Salida': 'CheckedOut',
  'Cancelada': 'Cancelled',
};

// ── Source Code (reservation source) ──
// The code in parentheses from the HubSpot enum is the Oracle sourceCode

export const SourceCodeMap: Record<string, string> = {
  'Walk-in (WLK)': 'WLK',
  'Global Distribution System (GDS)': 'GDS',
  'Online Travel Agency (OTA)': 'OTA',
  'Web Site Booking Engine (WSBE)': 'WSBE',
  'Hubspot (HS)': 'HS',
};

// ── Payment Method ──
// NOTE: Oracle uses different codes than HubSpot for some methods

export const PaymentMethodMap: Record<string, string | null> = {
  'Efectivo (CASH)': 'CASH',
  'Depósito (DP)': 'BTR',       // Oracle: BTR = Bank Transfer
  'Cuenta por Cobrar (CO)': 'INV', // Oracle: INV = Direct Bill
  'None (NON)': null,            // Do not send to Oracle
  'MasterCard (MC)': 'MC',
  'Visa (VI)': 'VA',            // Oracle: VA — NOT VI!
};

// ── Company Type ──

export const CompanyTypeMap: Record<string, OracleProfileType> = {
  'Agencia': 'TravelAgent',
  'Proveedor': 'Company',
  'CVR': 'Company',
};

// ── Room Type ──
// Real data from getRoomTypesLOV. PseudoYn=N are real rooms.

export const RoomTypeMap: Record<string, string> = {
  // Oracle codes (HubSpot internal values)
  'CASITA': 'CASITA',
  'PLCASITA': 'PLCASITA',
  'OWNERC': 'OWNERC',
  'VILLAS': 'VILLAS',
  // Label aliases (backward compatibility)
  'Casitas': 'CASITA',
  'Pool Casitas': 'PLCASITA',
  'Owners Casita': 'OWNERC',
  'Villas': 'VILLAS',
};

// ── Rate Plan ──
// Always use BAR codes directly.

export const RatePlanMap: Record<string, string> = {
  'Half Board': 'BARHB',
  'Overnight': 'BAROV',
  'Full board': 'BARFB',
};

// ── Meal Transaction Codes (Cashiering) ──
// Always Outlet 1 (main restaurant). Resort: CAR.

export const MealTransactionCodeMap: Record<string, string> = {
  breakfast: '2004',
  lunch: '2010',
  dinner: '2020',
};

// ── Activity Types ──
// NOT YET CONFIGURED IN ORACLE — only 3 generic types exist (*CSL*, BROCHURE, OUT).
// The 14 hotel activities need to be created in Oracle Back Office.
// Workaround: send as Guest Messages with the activity name.
// Uncomment and map when Oracle admin creates the activity types.

// ── Dietary Preferences ──
// getDietaryPreferencesLOV returned 0 items.
// Workaround: send allergies as Guest Message with typeOfMessage: 'dietary'.

// ── Service Request Codes ──
// getServiceRequestCodesLOV returned 0 items.
// Workaround: postTrackItItems accepts description without a code.
