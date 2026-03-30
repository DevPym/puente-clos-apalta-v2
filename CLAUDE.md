# Puente Clos Apalta v2

Middleware bridge: HubSpot CRM ↔ Oracle OPERA Cloud (OHIP REST API) for Clos Apalta boutique hotel.

## Stack

TypeScript ESM (`"type": "module"`), Express, axios (Oracle), @hubspot/api-client (SDK oficial), Zod, Vitest, PostgreSQL + Drizzle ORM, deployed on Railway.

## Architecture

Hybrid Clean Architecture + Modular by feature. Four layers with strict dependency flow:

```
infrastructure/ → features/ → domain/
      ↓               ↓            ↓
   shared/ ←←←←←← shared/ ←←←← shared/
```

- `domain/` — Zero external imports. Pure TS: interfaces, types, business rules.
- `features/` — Business logic per entity. Imports only from `domain/` and `shared/`. Dependencies injected via function parameters.
- `infrastructure/` — Implements ports from `domain/`. Only place where axios and HubSpot SDK live.
- `shared/` — Cross-cutting: config, logger, queue, errors, DB. Imported by any layer. Never imports from domain/features/infrastructure.

## Project Structure

```
src/
├── domain/types/          # oracle.types.ts, hubspot.types.ts, common.types.ts, mappings.ts
├── domain/ports/          # oracle.port.ts (IOracleClient), hubspot.port.ts (IHubSpotClient)
├── domain/rules/          # company.rules.ts, parsing helpers
├── features/contact/      # contact.job.ts, contact.mapper.ts, contact.job.test.ts
├── features/deal/         # deal.job.ts, deal.mapper.ts, deal.cancel.ts + tests
├── features/company/      # company.job.ts, company.mapper.ts + tests
├── features/appointment/  # appointment.job.ts, appointment.mapper.ts + tests
├── infrastructure/http/   # server.ts, routes/, middleware/
├── infrastructure/oracle/ # oracle.client.ts, oracle.auth.ts + tests
├── infrastructure/hubspot/# hubspot.client.ts + tests
├── shared/config/         # env.ts (Zod fail-fast), env.test.ts
├── shared/db/             # client.ts, schema.ts, migrate.ts (Drizzle)
├── shared/queue/          # queue.repository.ts, worker.ts (PG FOR UPDATE SKIP LOCKED)
├── shared/dlq/            # dlq.repository.ts (dead letter queue)
├── shared/logger/         # logger.ts (JSON prod / text dev), sync-log.repository.ts
└── shared/errors/         # app.errors.ts (OracleApiError, HubSpotApiError, ConfigError)
```

## Commands

```bash
npm run dev          # tsx watch src/index.ts
npm run build        # tsc
npm run test         # vitest run
npm run test:watch   # vitest --watch
npm run lint         # tsc --noEmit
npm run db:generate  # drizzle-kit generate
npm run db:migrate   # drizzle-kit migrate
npm run db:push      # drizzle-kit push (dev only)
```

## Hard Rules

1. **Zero `any`** — Use `unknown` + Zod validation or type guards when type is unknown.
2. **Errors identified by official code** — Every error carries a traceable code from Oracle or HubSpot official docs. Never invent error codes.
3. **Vitest is the only test framework** — No exceptions. Tests live next to source files: `foo.test.ts`.
4. **Verify before sending** — Every implementation must pass tests before integration.
5. **No inferred data** — If a value is missing, ask the user. Never guess LOV values, API codes, or mapping data.
6. **Prefer official documentation** — Oracle OHIP docs and HubSpot API docs over free internet sources.
7. **ESM imports require `.js` extension** — Always: `import { foo } from './bar.js'`
8. **`import type` for type-only imports** — Interfaces and types without runtime value use `import type`.
9. **Import order** — node builtins → external deps → domain → features → shared.
10. **Domain interfaces start with `I`** — `IOracleClient`, `IHubSpotClient`, `ILogger`.

## File Naming

Lowercase with dot separator. Suffix by role:
`.job.ts`, `.mapper.ts`, `.port.ts`, `.types.ts`, `.route.ts`, `.test.ts`, `.client.ts`

## Key Patterns

### Dependency Injection (manual, via factory)

```typescript
// container.ts creates Container { oracle, hubspot, logger, config }
// Jobs receive deps as first parameter: processContact(deps, payload)
```

### Result Type (never throw from business logic)

```typescript
type Result<T, E> = { ok: true; data: T } | { ok: false; error: E }
```

### Error Classes

```typescript
OracleApiError  — code: `ORACLE_{oracleErrorCode}`, includes statusCode
HubSpotApiError — code: `HUBSPOT_{hsErrorCategory}`, includes statusCode
ConfigError     — code: `CONFIG_INVALID`
```

### Queue

PostgreSQL-based with `FOR UPDATE SKIP LOCKED`. Three tables: `jobs`, `dead_letter_jobs`, `sync_logs`. Worker polls PG with exponential backoff, 3 retries before DLQ.

## Entity Mapping

```
HubSpot Object    → Domain Type          → Oracle API
──────────────    ─────────────          ──────────
Contact           → GuestProfile         → CRM: postGuestProfile
Deal              → OracleReservation    → Reservations: postReservation
Company           → CompanyProfile       → CRM: postCompanyProfile
Appointment       → 4 Oracle types:
                    ActivityBooking      → Leisure Management
                    GuestMessage         → Guest Messages
                    ServiceRequest       → Service Requests
                    BillingCharge        → Cashiering
```

## Oracle Environment

- Resort code: `CAR`
- External system: `CLOSAP_HS`
- Auth: OAuth2 token lifecycle with auto-refresh

## Mapping Tables (real LOV data, confirmed March 2026)

- **RoomType**: Casitas→CASITA, Pool Casitas→PLCASITA, Owners Casita→OWNERC, Villas→VILLAS
- **RatePlan**: BARHB, BAROV, BARFB (always use BAR codes)
- **Payment**: Efectivo→CASH, Depósito→BTR, Cuenta por Cobrar→INV, Visa→VA (not VI!), MasterCard→MC
- **MealTxn**: Outlet 1 — breakfast=2004, lunch=2010, dinner=2020
- **ReservationStatus**: Confirmada→Reserved, Hospedado→InHouse, Salida→CheckedOut, Cancelada→Cancelled
- **CompanyType**: Agencia→TravelAgent, Proveedor→Company, CVR→Company

## Pending Actions (do NOT guess these values)

- HubSpot: Update `room_type` enum with real names (blocks Sprint 6)
- Oracle Back Office: Create 14 Activity Types (blocks Sprint 7)
- Oracle Back Office: Create Dietary Preferences LOV (optional, Sprint 4)
- Oracle Back Office: Create Service Request Codes LOV (optional, Sprint 7)

## Sprint Roadmap

Sprint 0: Scaffolding → Sprint 1: Domain types/ports → Sprint 2: Infrastructure clients →
Sprint 3: DB/Queue/Worker → Sprint 4: Contact feature → Sprint 5: Company feature →
Sprint 6: Deal feature → Sprint 7: Appointment feature → Sprint 8: Hardening

## Canonical Reference

See @docs/ARCHITECTURE.md for the full 2,265-line design document with all type definitions, port interfaces, mapping tables, and implementation details.

## TypeScript Config

Target: ES2022, Module: NodeNext, strict: true, noUnusedLocals, noUnusedParameters, noImplicitReturns.

## Deploy (Railway)

- Auto-deploy from `main` branch
- Build: `npm run build` → Start: `node dist/index.js`
- PostgreSQL addon with auto-injected `DATABASE_URL`
- Health check: `GET /health`
- Webhook URL: `https://puente-clos-apalta-v2-production.up.railway.app/webhook/hubspot`
- PORT is dynamic (Railway injects as string, Zod coerces to number)

## Verified Live (2026-03-30)

| Flujo | Estado | Notas |
|---|---|---|
| Contact → Oracle Guest Profile | ✅ | CREATE + UPDATE via webhook |
| Company → Oracle Agent/Company Profile | ✅ | CREATE + UPDATE via webhook |
| Deal → Oracle Reservation | ✅ | CREATE + UPDATE. Guests, rooms, rates, payment |
| Appointment → Oracle (4 APIs) | ✅ | Messages, Service Requests, Billing, Activities |
| Webhooks HubSpot → Railway | ✅ | HMAC v3 verificado, sin Invalid payload |
| Deal cancellation | ⚠️ | Payload corregido, usa confirmation_number__oracle |

## Limitaciones conocidas v1

### TravelAgent en Reservation
Oracle OHIP Property API (`/rsv/v1/`) NO soporta la vinculación de perfiles TravelAgent/Agent a reservas via POST/PUT. Oracle acepta el payload sin error pero ignora silenciosamente los perfiles Agent. Verificado en producción con 5 formatos diferentes (reservationProfiles, reservationGuests, stayProfiles).

**Workaround:** Vincular TravelAgent manualmente en Oracle UI después de que el puente cree la reserva.

**Solución v2:** Investigar Oracle Distribution API (`/rsv-ext/v1/`) que tiene un schema diferente para perfiles, o implementar Oracle Business Events (webhooks outbound) para sincronizar cuando un TA se vincula desde la UI.

### Activity Types
Los 14 tipos de actividades del hotel no están creados en Oracle Back Office. Las actividades se envían como Guest Messages (workaround).

### Dietary Preferences / Service Request Codes
`getDietaryPreferencesLOV` y `getServiceRequestCodesLOV` devuelven 0 items en Oracle. Se envían como texto libre.

### Confirmation Number writeback
El `extractReservationIds` puede no extraer el Confirmation Number correctamente en todos los casos. Se recomienda verificar `confirmation_number__oracle` en HubSpot después de crear una reserva.

## IDs de prueba verificados (2026-03-30)

```
HubSpot:
  contactId  = 212513120257  (Prueba Prueba)    → Oracle: 37519082
  companyId  = 53425551895   (Ekatours)          → Oracle: 37522366
  dealId     = 58560207652   (Reserva test)      → Oracle: 42874282
  appointmentId = 543784959890

Oracle Hotel: CAR (Clos Apalta)
Appointment objectTypeId: 0-421
```
