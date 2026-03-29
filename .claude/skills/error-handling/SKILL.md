---
name: error-handling
description: Error handling patterns for Puente Clos Apalta v2. Use when implementing error classes, retry logic, DLQ, or debugging API errors. All error codes must come from official Oracle or HubSpot documentation.
allowed-tools: Read, Grep
---

# Error Handling — Puente Clos Apalta v2

## Core Principle

Every error carries a traceable code from official documentation. NEVER invent error codes.

## Error Class Hierarchy
```typescript
AppError (base)
├── OracleApiError  — code: ORACLE_{o:errorCode from response}
├── HubSpotApiError — code: HUBSPOT_{category from response}
└── ConfigError     — code: CONFIG_INVALID
```

## Oracle Errors

Extract `o:errorCode` from response. Common codes:
INVALID_PARAMETER, DUPLICATE_RECORD, RECORD_NOT_FOUND, UNAUTHORIZED, FORBIDDEN
Look up unfamiliar codes in Oracle OHIP REST API documentation.

## HubSpot Errors

Extract `category` from response. Common categories:
RATE_LIMITS (429 retry), OBJECT_NOT_FOUND, VALIDATION_ERROR, CONFLICT, OBJECT_ALREADY_EXISTS

## Retry Logic

Retryable: 429, 500, 502, 503, 504
NOT retryable: 400, 401, 403, 404, 405, 406, 409, 422
Strategy: exponential backoff (0s, 2s, 8s), 3 attempts, then DLQ

## Result Pattern
```typescript
type Result<T, E> = { ok: true; data: T } | { ok: false; error: E }
// Business logic returns Result, never throws
```

## DLQ

PostgreSQL `dead_letter_jobs` with JSONB payload. Stores original payload,
error code/message, all retry attempts. Recovery via /admin/dlq endpoints.

## Rules

1. NEVER catch and silently swallow errors
2. NEVER use generic messages like "Something went wrong"
3. ALWAYS include original API error code in logged error
4. ALWAYS include enough context to reproduce (IDs, payloads)
5. Unknown error codes → look up in official docs before handling
