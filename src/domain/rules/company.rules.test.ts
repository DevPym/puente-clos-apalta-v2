import { describe, it, expect } from 'vitest';
import {
  resolveOracleCompanyType,
  isPrimaryGuest,
  mapReservationStatus,
  parseSourceCode,
  parsePaymentMethod,
  parseNumberFromString,
  isRetryableError,
  parseOracleReservationIds,
} from './company.rules.js';

// ── resolveOracleCompanyType ──

describe('resolveOracleCompanyType', () => {
  it('returns TravelAgent when iataCode is present', () => {
    expect(resolveOracleCompanyType('Proveedor', 'IATA123')).toBe('TravelAgent');
  });

  it('returns TravelAgent when iataCode is present even if tipo is null', () => {
    expect(resolveOracleCompanyType(null, 'IATA123')).toBe('TravelAgent');
  });

  it('returns TravelAgent for Agencia without iataCode', () => {
    expect(resolveOracleCompanyType('Agencia')).toBe('TravelAgent');
  });

  it('returns Company for Proveedor', () => {
    expect(resolveOracleCompanyType('Proveedor')).toBe('Company');
  });

  it('returns Company for CVR', () => {
    expect(resolveOracleCompanyType('CVR')).toBe('Company');
  });

  it('returns Company for unknown tipo_de_empresa', () => {
    expect(resolveOracleCompanyType('Unknown')).toBe('Company');
  });

  it('returns Company when tipo_de_empresa is null', () => {
    expect(resolveOracleCompanyType(null)).toBe('Company');
  });

  it('returns Company when tipo_de_empresa is undefined', () => {
    expect(resolveOracleCompanyType(undefined)).toBe('Company');
  });
});

// ── isPrimaryGuest ──

describe('isPrimaryGuest', () => {
  it('returns true when labels include "Huésped Principal"', () => {
    expect(isPrimaryGuest(['Huésped Principal'])).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isPrimaryGuest(['huésped principal'])).toBe(true);
    expect(isPrimaryGuest(['HUÉSPED PRINCIPAL'])).toBe(true);
  });

  it('returns true when mixed with other labels', () => {
    expect(isPrimaryGuest(['Other Label', 'Huésped Principal'])).toBe(true);
  });

  it('returns false when label is absent', () => {
    expect(isPrimaryGuest(['Acompañante'])).toBe(false);
  });

  it('returns false for empty labels', () => {
    expect(isPrimaryGuest([])).toBe(false);
  });
});

// ── mapReservationStatus ──

describe('mapReservationStatus', () => {
  it('maps Confirmada to Reserved', () => {
    expect(mapReservationStatus('Confirmada')).toBe('Reserved');
  });

  it('maps Hospedado to InHouse', () => {
    expect(mapReservationStatus('Hospedado')).toBe('InHouse');
  });

  it('maps Salida to CheckedOut', () => {
    expect(mapReservationStatus('Salida')).toBe('CheckedOut');
  });

  it('maps Cancelada to Cancelled', () => {
    expect(mapReservationStatus('Cancelada')).toBe('Cancelled');
  });

  it('passes through Oracle codes directly', () => {
    expect(mapReservationStatus('Reserved')).toBe('Reserved');
    expect(mapReservationStatus('InHouse')).toBe('InHouse');
    expect(mapReservationStatus('CheckedOut')).toBe('CheckedOut');
    expect(mapReservationStatus('Cancelled')).toBe('Cancelled');
  });

  it('throws for unknown status', () => {
    expect(() => mapReservationStatus('Desconocido')).toThrow('Unknown reservation status');
  });
});

// ── parseSourceCode ──

describe('parseSourceCode', () => {
  it('extracts WLK from "Walk-in (WLK)"', () => {
    expect(parseSourceCode('Walk-in (WLK)')).toBe('WLK');
  });

  it('extracts GDS from "Global Distribution System (GDS)"', () => {
    expect(parseSourceCode('Global Distribution System (GDS)')).toBe('GDS');
  });

  it('extracts OTA from "Online Travel Agency (OTA)"', () => {
    expect(parseSourceCode('Online Travel Agency (OTA)')).toBe('OTA');
  });

  it('extracts WSBE from "Web Site Booking Engine (WSBE)"', () => {
    expect(parseSourceCode('Web Site Booking Engine (WSBE)')).toBe('WSBE');
  });

  it('extracts HS from "Hubspot (HS)"', () => {
    expect(parseSourceCode('Hubspot (HS)')).toBe('HS');
  });

  it('returns direct Oracle code when value is a valid code', () => {
    expect(parseSourceCode('HS')).toBe('HS');
    expect(parseSourceCode('WLK')).toBe('WLK');
    expect(parseSourceCode('GDS')).toBe('GDS');
    expect(parseSourceCode('OTA')).toBe('OTA');
    expect(parseSourceCode('WSBE')).toBe('WSBE');
  });

  it('throws for value without parentheses and not a valid code', () => {
    expect(() => parseSourceCode('Direct')).toThrow('Cannot parse source code');
  });
});

// ── parsePaymentMethod ──

describe('parsePaymentMethod', () => {
  it('extracts CASH from "Efectivo (CASH)"', () => {
    expect(parsePaymentMethod('Efectivo (CASH)')).toBe('CASH');
  });

  it('extracts VI from "Visa (VI)"', () => {
    expect(parsePaymentMethod('Visa (VI)')).toBe('VI');
  });

  it('extracts MC from "MasterCard (MC)"', () => {
    expect(parsePaymentMethod('MasterCard (MC)')).toBe('MC');
  });

  it('extracts NON from "None (NON)"', () => {
    expect(parsePaymentMethod('None (NON)')).toBe('NON');
  });

  it('returns direct Oracle code when value is a valid code', () => {
    expect(parsePaymentMethod('CASH')).toBe('CASH');
    expect(parsePaymentMethod('BTR')).toBe('BTR');
    expect(parsePaymentMethod('INV')).toBe('INV');
    expect(parsePaymentMethod('MC')).toBe('MC');
    expect(parsePaymentMethod('VA')).toBe('VA');
    expect(parsePaymentMethod('NON')).toBe('NON');
  });

  it('throws for value without parentheses and not a valid code', () => {
    expect(() => parsePaymentMethod('Cash')).toThrow('Cannot parse payment method');
  });
});

// ── parseNumberFromString ──

describe('parseNumberFromString', () => {
  it('parses "2" to 2', () => {
    expect(parseNumberFromString('2')).toBe(2);
  });

  it('parses "0" to 0', () => {
    expect(parseNumberFromString('0')).toBe(0);
  });

  it('parses "10" to 10', () => {
    expect(parseNumberFromString('10')).toBe(10);
  });

  it('returns null for null', () => {
    expect(parseNumberFromString(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(parseNumberFromString(undefined)).toBeNull();
  });

  it('returns null for "null" string', () => {
    expect(parseNumberFromString('null')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseNumberFromString('')).toBeNull();
  });

  it('throws for non-numeric string', () => {
    expect(() => parseNumberFromString('abc')).toThrow('Cannot parse number');
  });
});

// ── isRetryableError ──

describe('isRetryableError', () => {
  it('returns true for 429', () => {
    expect(isRetryableError(429)).toBe(true);
  });

  it('returns true for 500', () => {
    expect(isRetryableError(500)).toBe(true);
  });

  it('returns true for 502', () => {
    expect(isRetryableError(502)).toBe(true);
  });

  it('returns true for 503', () => {
    expect(isRetryableError(503)).toBe(true);
  });

  it('returns true for 504', () => {
    expect(isRetryableError(504)).toBe(true);
  });

  it('returns false for 400', () => {
    expect(isRetryableError(400)).toBe(false);
  });

  it('returns false for 401', () => {
    expect(isRetryableError(401)).toBe(false);
  });

  it('returns false for 404', () => {
    expect(isRetryableError(404)).toBe(false);
  });

  it('returns false for 200', () => {
    expect(isRetryableError(200)).toBe(false);
  });
});

// ── parseOracleReservationIds ──

describe('parseOracleReservationIds', () => {
  it('parses all three ID types', () => {
    const ids = parseOracleReservationIds([
      { type: 'Reservation', id: 'R-001' },
      { type: 'Confirmation', id: 'C-001' },
      { type: 'CancellationNumber', id: 'X-001' },
    ]);
    expect(ids).toEqual({
      internalId: 'R-001',
      confirmationId: 'C-001',
      cancellationId: 'X-001',
    });
  });

  it('parses with only Reservation ID', () => {
    const ids = parseOracleReservationIds([
      { type: 'Reservation', id: 'R-002' },
    ]);
    expect(ids).toEqual({
      internalId: 'R-002',
      confirmationId: undefined,
      cancellationId: undefined,
    });
  });

  it('parses Reservation and Confirmation without Cancellation', () => {
    const ids = parseOracleReservationIds([
      { type: 'Reservation', id: 'R-003' },
      { type: 'Confirmation', id: 'C-003' },
    ]);
    expect(ids.internalId).toBe('R-003');
    expect(ids.confirmationId).toBe('C-003');
    expect(ids.cancellationId).toBeUndefined();
  });

  it('throws if Reservation ID is missing', () => {
    expect(() =>
      parseOracleReservationIds([{ type: 'Confirmation', id: 'C-004' }]),
    ).toThrow('Missing Reservation ID');
  });

  it('throws for empty array', () => {
    expect(() => parseOracleReservationIds([])).toThrow('Missing Reservation ID');
  });

  it('ignores malformed entries', () => {
    const ids = parseOracleReservationIds([
      { type: 'Reservation', id: 'R-005' },
      { type: 123, id: 'bad' },       // type not a string
      { foo: 'bar' },                  // missing type and id
      null,                            // null entry
      'string entry',                  // not an object
    ]);
    expect(ids.internalId).toBe('R-005');
  });

  it('ignores unknown ID types', () => {
    const ids = parseOracleReservationIds([
      { type: 'Reservation', id: 'R-006' },
      { type: 'ExternalReference', id: 'EXT-006' },
    ]);
    expect(ids.internalId).toBe('R-006');
    expect(ids.confirmationId).toBeUndefined();
  });
});
