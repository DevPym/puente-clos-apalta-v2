---
name: oracle-api
description: Oracle OPERA Cloud (OHIP) REST API patterns, authentication, error handling, and payload structures. Use when implementing oracle.client.ts, oracle.auth.ts, or any code that calls Oracle APIs.
allowed-tools: Read, Grep, Bash(npm:*), Bash(npx:*)
---

# Oracle OHIP REST API Patterns

## Authentication

OAuth2 client credentials flow. Token lifecycle managed in `infrastructure/oracle/oracle.auth.ts`.
```
POST /oauth/v1/tokens
Content-Type: application/x-www-form-urlencoded
grant_type=client_credentials&client_id={id}&client_secret={secret}
```

Token has an expiration. Refresh proactively before expiry.

## Required Headers (every request)
```
Authorization: Bearer {token}
x-hotelid: {ORACLE_HOTEL_ID}       // "CAR" for Clos Apalta
x-app-key: {ORACLE_APP_KEY}        // UUID format
Content-Type: application/json;charset=UTF-8
```

## Error Response Pattern

Oracle returns errors with this structure:
```json
{
  "type": "error",
  "title": "Human readable title",
  "o:errorCode": "SPECIFIC_ERROR_CODE",
  "detail": "Detailed error description",
  "status": 400
}
```

Always extract `o:errorCode` and wrap in `OracleApiError`.

## Retryable Status Codes

429, 500, 502, 503, 504 — retry with exponential backoff.
400, 401, 403, 404, 405, 406 — do NOT retry, send to DLQ.

## Key APIs Used

- CRM Guest: POST/PUT/GET /crm/v1/guests
- CRM Company: POST/PUT /crm/v1/companies
- Reservations: POST/PUT/GET /rsv/v1/hotels/{hotelId}/reservations
- Leisure: POST /act/v1/hotels/{hotelId}/activityBookings
- Messages: POST /fof/v1/hotels/{hotelId}/guestMessages
- Service Requests: POST /fof/v1/hotels/{hotelId}/serviceRequests
- Cashiering: POST /csh/v1/hotels/{hotelId}/charges

## Important Caveats

- Resort code always `CAR`
- Visa payment = `VA` in Oracle, NOT `VI`
- Deposit payment = `BTR`, NOT `DP`
- Account receivable = `INV`, NOT `CO`
- Oracle amounts are strings, not numbers
- Dates: ISO 8601 date only (YYYY-MM-DD), no time
- givenName max 40 chars, surname max 40 chars
