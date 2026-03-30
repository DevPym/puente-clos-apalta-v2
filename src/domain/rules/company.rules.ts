import type { OracleProfileType, OracleResStatus } from '../types/oracle.types.js';
import type { ReservationIds } from '../types/oracle.types.js';
import { ReservationStatusMap, CompanyTypeMap } from '../types/mappings.js';

/**
 * Resolves the Oracle profile type for a company.
 * If iataCode is present → TravelAgent.
 * If tipoDeEmpresa is 'Agencia' → TravelAgent.
 * Otherwise → Company (covers Proveedor and CVR).
 */
export function resolveOracleCompanyType(
  tipoDeEmpresa: string | null | undefined,
  iataCode?: string | null,
): OracleProfileType {
  if (iataCode) return 'TravelAgent';
  if (tipoDeEmpresa && tipoDeEmpresa in CompanyTypeMap) {
    return CompanyTypeMap[tipoDeEmpresa];
  }
  return 'Company';
}

/**
 * Checks if a contact is the primary guest based on association labels.
 * Case-insensitive match for 'Huésped Principal'.
 */
export function isPrimaryGuest(labels: string[]): boolean {
  return labels.some(
    (label) => label.toLowerCase() === 'huésped principal',
  );
}

/**
 * Maps a HubSpot reservation status to an Oracle reservation status.
 * Throws if the value is not in the mapping table.
 */
export function mapReservationStatus(hsStatus: string): OracleResStatus {
  const mapped = ReservationStatusMap[hsStatus];
  if (!mapped) {
    throw new Error(`Unknown reservation status: "${hsStatus}". Valid values: ${Object.keys(ReservationStatusMap).join(', ')}`);
  }
  return mapped;
}

const VALID_SOURCE_CODES = new Set(['WLK', 'GDS', 'OTA', 'WSBE', 'HS']);

/**
 * Extracts the source code from a HubSpot enum value.
 * Accepts direct Oracle codes (e.g. "HS") or label format (e.g. "Walk-in (WLK)").
 */
export function parseSourceCode(hsValue: string): string {
  if (VALID_SOURCE_CODES.has(hsValue)) return hsValue;
  const match = /\((\w+)\)$/.exec(hsValue);
  if (!match) {
    throw new Error(`Cannot parse source code from: "${hsValue}". Expected: Oracle code or "Label (CODE)"`);
  }
  return match[1];
}

const VALID_PAYMENT_CODES = new Set(['CASH', 'BTR', 'INV', 'MC', 'VA', 'NON']);

/**
 * Extracts the payment method code from a HubSpot enum value.
 * Accepts direct Oracle codes (e.g. "VA") or label format (e.g. "Visa (VI)").
 */
export function parsePaymentMethod(hsValue: string): string {
  if (VALID_PAYMENT_CODES.has(hsValue)) return hsValue;
  const match = /\((\w+)\)$/.exec(hsValue);
  if (!match) {
    throw new Error(`Cannot parse payment method from: "${hsValue}". Expected: Oracle code or "Label (CODE)"`);
  }
  return match[1];
}

/**
 * Parses a numeric string (from HubSpot) to a number.
 * Returns null for null/undefined/"null"/empty values.
 * Throws if the value is present but not a valid integer.
 */
export function parseNumberFromString(value: string | null | undefined): number | null {
  if (value == null || value === 'null' || value === '') return null;
  const num = parseInt(value, 10);
  if (Number.isNaN(num)) {
    throw new Error(`Cannot parse number from: "${value}"`);
  }
  return num;
}

/**
 * Determines if an HTTP status code represents a retryable error.
 */
export function isRetryableError(statusCode: number): boolean {
  return [429, 500, 502, 503, 504].includes(statusCode);
}

/**
 * Parses Oracle's reservationIdList array into typed ReservationIds.
 * Each entry is expected to have { type: string, id: string }.
 */
export function parseOracleReservationIds(reservationIdList: unknown[]): ReservationIds {
  let internalId = '';
  let confirmationId: string | undefined;
  let cancellationId: string | undefined;

  for (const item of reservationIdList) {
    if (
      typeof item === 'object' &&
      item !== null &&
      'type' in item &&
      'id' in item &&
      typeof (item as Record<string, unknown>).type === 'string' &&
      typeof (item as Record<string, unknown>).id === 'string'
    ) {
      const entry = item as { type: string; id: string };
      switch (entry.type) {
        case 'Reservation':
          internalId = entry.id;
          break;
        case 'Confirmation':
          confirmationId = entry.id;
          break;
        case 'CancellationNumber':
          cancellationId = entry.id;
          break;
      }
    }
  }

  if (!internalId) {
    throw new Error('Missing Reservation ID in reservationIdList');
  }

  return { internalId, confirmationId, cancellationId };
}
