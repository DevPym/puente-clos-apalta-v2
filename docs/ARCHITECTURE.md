# Puente Clos Apalta v2 — Documento de Arquitectura

> Middleware de integración entre HubSpot CRM y Oracle OPERA Cloud (OHIP REST API)
> para hotel boutique Clos Apalta.

---

## 1. Decisiones de diseño

| Decisión                  | Elección                                              |
| ------------------------- | ----------------------------------------------------- |
| Patrón de arquitectura    | Híbrido Clean Architecture + Modular por feature      |
| Configuración / env       | zod con validación al arranque (fail-fast)            |
| Framework de testing      | Vitest                                                |
| Logger                    | JSON estructurado en producción, texto legible en dev |
| Inyección de dependencias | Manual (función factory en `container.ts`)            |
| Módulos TypeScript        | ESM nativo (`"type": "module"`)                       |
| Alcance fase 1            | Estabilizar flujo HubSpot → Oracle                    |
| Runtime                   | Node.js + TypeScript                                  |
| Framework HTTP            | Express                                               |
| HTTP client (Oracle)      | axios                                                 |
| HubSpot client            | @hubspot/api-client (SDK oficial)                     |
| Plataforma de deploy      | Railway (auto-deploy desde main, dominio .railway.app)|
| Persistencia              | PostgreSQL (Railway addon) + Drizzle ORM              |
| Control de versiones      | GitHub                                                |

---

## 2. Reglas de dependencia

```
Las dependencias solo fluyen HACIA ABAJO. Nunca al revés.

  infrastructure/  →  features/  →  domain/
        ↓                ↓              ↓
     shared/ ←←←←←←← shared/ ←←←←← shared/
        (transversal a todas las capas)
```

### Regla 1 — `domain/` no importa nada externo
Cero imports de axios, Express, SDK de HubSpot, ni de node_modules.
Solo TypeScript puro: interfaces, tipos, funciones de reglas de negocio.

### Regla 2 — `features/` solo importa de `domain/` y `shared/`
Cada job recibe sus dependencias como parámetro (inyección por función).
Nunca importa directamente de `infrastructure/`.

### Regla 3 — `infrastructure/` implementa los ports de `domain/`
`oracle.client.ts` hace `implements IOracleClient`.
`hubspot.client.ts` hace `implements IHubSpotClient`.
Es el único lugar donde viven axios y el SDK de HubSpot.

### Regla 4 — `shared/` es transversal
Config, logger, queue, errores. Puede ser importado por cualquier capa.
No importa de `domain/`, `features/`, ni `infrastructure/`.

---

## 3. Estructura de carpetas

```
src/
│
├── domain/                          # CAPA 1: Cero dependencias externas
│   ├── types/
│   │   ├── oracle.types.ts          # GuestProfile, OracleReservation, CompanyProfile
│   │   ├── hubspot.types.ts         # HsDeal, HsContact, HsCompany, WebhookEvent
│   │   └── common.types.ts          # Result<T,E>, JobPayload, SyncDirection
│   ├── ports/
│   │   ├── oracle.port.ts           # interface IOracleClient
│   │   └── hubspot.port.ts          # interface IHubSpotClient
│   └── rules/
│       └── company.rules.ts         # resolveOracleCompanyType(), isPrimaryGuest()
│
├── features/                        # CAPA 2: Lógica de negocio por entidad
│   ├── contact/
│   │   ├── contact.job.ts           # processContact(deps, payload)
│   │   ├── contact.mapper.ts        # mapHsContactToGuestProfile()
│   │   └── contact.job.test.ts      # Vitest unit tests
│   ├── deal/
│   │   ├── deal.job.ts              # processDeal(deps, payload)
│   │   ├── deal.mapper.ts           # mapHsDealToReservation()
│   │   ├── deal.cancel.ts           # cancelDeal(deps, payload)
│   │   └── deal.job.test.ts         # Vitest unit tests
│   └── company/
│       ├── company.job.ts           # processCompany(deps, payload)
│       ├── company.mapper.ts        # mapHsCompanyToOracleProfile()
│       └── company.job.test.ts      # Vitest unit tests
│   └── appointment/                 # Registro diario → 4 APIs Oracle
│       ├── appointment.job.ts       # processAppointment(deps, payload)
│       ├── appointment.mapper.ts    # mapHsAppointment → 4 Oracle types
│       └── appointment.job.test.ts  # Vitest unit tests
│
├── infrastructure/                  # CAPA 3: Implementa ports, habla con el mundo
│   ├── http/
│   │   ├── server.ts                # Express app setup + middleware global
│   │   ├── routes/
│   │   │   ├── webhook.route.ts     # POST /webhook/hubspot → valida → enqueue
│   │   │   ├── health.route.ts      # GET /health (readiness + liveness)
│   │   │   ├── sync.route.ts        # GET /sync-to-oracle/:hsId (manual recovery)
│   │   │   └── dlq.route.ts         # GET /admin/dlq, POST resolve/retry
│   │   └── middleware/
│   │       ├── webhook.verify.ts    # Verificación firma HubSpot v3
│   │       └── error.handler.ts     # Express error middleware global
│   ├── oracle/
│   │   ├── oracle.client.ts         # implements IOracleClient (axios)
│   │   ├── oracle.auth.ts           # OAuth token lifecycle + refresh
│   │   └── oracle.client.test.ts    # Integration tests (HTTP mockeado)
│   ├── hubspot/
│   │   ├── hubspot.client.ts        # implements IHubSpotClient (SDK oficial)
│   │   └── hubspot.client.test.ts   # Integration tests
│   └── streaming/
│       └── oracle.streamer.ts       # WebSocket OHIP — inactivo, JSDoc con pasos
│
├── shared/                          # TRANSVERSAL a todas las capas
│   ├── config/
│   │   ├── env.ts                   # zod schema → export const config
│   │   └── env.test.ts              # Verifica que el schema rechace valores inválidos
│   ├── db/
│   │   ├── client.ts                # Drizzle + postgres.js connection
│   │   ├── schema.ts                # Drizzle schema: jobs, dead_letter_jobs, sync_logs
│   │   └── migrate.ts               # Ejecuta migraciones al arranque
│   ├── queue/
│   │   ├── queue.repository.ts      # PG — enqueue, dequeue, complete, fail
│   │   ├── worker.ts                # Poll PG + exponential backoff + dispatch
│   │   └── queue.test.ts            # Tests con PG de test o mocks
│   ├── dlq/
│   │   ├── dlq.repository.ts        # PG — insert, query, markResolved
│   │   └── dlq.repository.test.ts   # Tests
│   ├── logger/
│   │   ├── logger.ts                # JSON (prod) / texto con emojis (dev)
│   │   └── sync-log.repository.ts   # PG — persistir logs de sincronización
│   └── errors/
│       └── app.errors.ts            # OracleApiError, HubSpotApiError, ConfigError, etc.
│
├── container.ts                     # Wiring: instancia clients + db → inyecta en jobs
└── index.ts                         # Entry point: valida config → migrate → container → server

Raíz del proyecto:
├── .env                             # Variables de entorno local (git-ignored)
├── .env.example                     # Template documentado con todos los valores
├── drizzle.config.ts                # Config de drizzle-kit (migraciones)
├── drizzle/                         # Carpeta de migraciones SQL generadas
├── tsconfig.json                    # ESM, strict, NodeNext
├── vitest.config.ts                 # Config de Vitest
├── package.json                     # type: "module"
├── .gitignore                       # node_modules, dist, .env
└── README.md
```

---

## 4. Stack técnico completo

### Runtime y lenguaje
- **Node.js** (LTS vigente)
- **TypeScript** con `strict: true`
- **ESM nativo** (`"type": "module"` en package.json)

### Dependencias de producción
| Paquete               | Propósito                              |
| --------------------- | -------------------------------------- |
| `express`             | Servidor HTTP, rutas, middleware       |
| `axios`               | Cliente HTTP para Oracle OHIP REST API |
| `@hubspot/api-client` | SDK oficial de HubSpot                 |
| `zod`                 | Validación de config al arranque       |
| `dotenv`              | Carga de variables desde `.env`        |
| `drizzle-orm`         | ORM type-safe para PostgreSQL          |
| `postgres`            | Driver PostgreSQL para Drizzle (postgres.js) |

### Dependencias de desarrollo
| Paquete                    | Propósito                              |
| -------------------------- | -------------------------------------- |
| `typescript`               | Compilador TypeScript                  |
| `vitest`                   | Framework de testing                   |
| `tsx`                      | Ejecución directa de .ts en desarrollo |
| `@types/express`           | Tipos de Express                       |
| `@types/node`              | Tipos de Node.js                       |
| `drizzle-kit`              | CLI para migraciones de Drizzle        |

### Infraestructura
| Componente          | Herramienta                                        |
| ------------------- | -------------------------------------------------- |
| Plataforma de deploy| Railway (auto-deploy desde GitHub main)            |
| Dominio público     | {service}.railway.app (TLS automático)             |
| Control versiones   | GitHub                                             |
| Cola de jobs        | PostgreSQL (tabla jobs, polling desde worker)       |
| Persistencia        | PostgreSQL (Railway addon) + Drizzle ORM           |
| Base de datos       | PostgreSQL (Railway addon, DATABASE_URL auto)       |

---

## 5. Patrones clave

### 5.1 Inyección manual de dependencias

```typescript
// container.ts
import { OracleClient } from './infrastructure/oracle/oracle.client.js';
import { HubSpotClient } from './infrastructure/hubspot/hubspot.client.js';
import { createLogger } from './shared/logger/logger.js';
import { config } from './shared/config/env.js';
import type { IOracleClient } from './domain/ports/oracle.port.js';
import type { IHubSpotClient } from './domain/ports/hubspot.port.js';

export interface Container {
  oracle: IOracleClient;
  hubspot: IHubSpotClient;
  logger: ILogger;
  config: typeof config;
}

export function createContainer(): Container {
  const logger = createLogger(config.nodeEnv);
  const oracle = new OracleClient(config.oracle, logger);
  const hubspot = new HubSpotClient(config.hubspot, logger);
  return { oracle, hubspot, logger, config };
}
```

### 5.2 Job con dependencias inyectadas (testeable)

```typescript
// features/contact/contact.job.ts
import type { IOracleClient } from '../../domain/ports/oracle.port.js';
import type { IHubSpotClient } from '../../domain/ports/hubspot.port.js';
import { mapHsContactToGuestProfile } from './contact.mapper.js';

interface ContactJobDeps {
  oracle: IOracleClient;
  hubspot: IHubSpotClient;
  logger: ILogger;
}

export async function processContact(
  deps: ContactJobDeps,
  payload: { contactId: string }
): Promise<void> {
  const { oracle, hubspot, logger } = deps;
  // ... lógica de negocio usando interfaces, no implementaciones
}
```

### 5.3 Test con mock directo (Vitest)

```typescript
// features/contact/contact.job.test.ts
import { describe, it, expect, vi } from 'vitest';
import { processContact } from './contact.job.js';
import type { IOracleClient } from '../../domain/ports/oracle.port.js';

describe('processContact', () => {
  it('crea perfil en Oracle si contacto no tiene id_oracle', async () => {
    const mockOracle: IOracleClient = {
      createGuestProfile: vi.fn().mockResolvedValue('ORACLE-123'),
      // ... otros métodos del port
    };
    const mockHubspot: IHubSpotClient = {
      getContactById: vi.fn().mockResolvedValue({
        id: 'HS-1', firstName: 'Juan', lastName: 'Pérez', id_oracle: null
      }),
      updateContact: vi.fn().mockResolvedValue(undefined),
    };
    const mockLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn() };

    await processContact(
      { oracle: mockOracle, hubspot: mockHubspot, logger: mockLogger },
      { contactId: 'HS-1' }
    );

    expect(mockOracle.createGuestProfile).toHaveBeenCalledOnce();
    expect(mockHubspot.updateContact).toHaveBeenCalledWith('HS-1', {
      id_oracle: 'ORACLE-123'
    });
  });
});
```

### 5.4 Configuración con zod (fail-fast)

```typescript
// shared/config/env.ts
import { z } from 'zod';
import 'dotenv/config';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),

  // Oracle OHIP
  ORACLE_BASE_URL: z.string().url(),
  ORACLE_CLIENT_ID: z.string().min(1),
  ORACLE_CLIENT_SECRET: z.string().min(1),
  ORACLE_HOTEL_ID: z.string().min(1),
  ORACLE_APP_KEY: z.string().uuid(),
  ORACLE_CANCELLATION_REASON_CODE: z.string().default('CANCEL'),

  // HubSpot
  HUBSPOT_ACCESS_TOKEN: z.string().min(1),
  HUBSPOT_CLIENT_SECRET: z.string().min(1),

  // Railway
  RAILWAY_PUBLIC_DOMAIN: z.string().optional(),  // Inyectada por Railway automáticamente
  DATABASE_URL: z.string().url(),                // Railway inyecta automáticamente (PostgreSQL)
});

// Si falla, el servidor NO arranca y muestra qué variables faltan
const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Configuración inválida:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;

// Tipo derivado automáticamente del schema
export type AppConfig = z.infer<typeof envSchema>;
```

### 5.5 Logger dual (JSON prod / texto dev)

```typescript
// shared/logger/logger.ts
export interface ILogger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export function createLogger(env: string): ILogger {
  const isDev = env === 'development';

  function log(level: string, message: string, meta?: Record<string, unknown>) {
    const entry = { timestamp: new Date().toISOString(), level, message, ...meta };

    if (isDev) {
      const emoji = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : 'ℹ️';
      const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
      console.log(`${emoji} [${level.toUpperCase()}] ${message}${metaStr}`);
    } else {
      console.log(JSON.stringify(entry));
    }
  }

  return {
    info: (msg, meta) => log('info', msg, meta),
    warn: (msg, meta) => log('warn', msg, meta),
    error: (msg, meta) => log('error', msg, meta),
  };
}
```

### 5.6 Errores tipados por origen

```typescript
// shared/errors/app.errors.ts
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class OracleApiError extends AppError {
  constructor(message: string, oracleErrorCode: string, statusCode: number, context?: Record<string, unknown>) {
    super(message, `ORACLE_${oracleErrorCode}`, statusCode, context);
  }
}

export class HubSpotApiError extends AppError {
  constructor(message: string, hsErrorCategory: string, statusCode: number, context?: Record<string, unknown>) {
    super(message, `HUBSPOT_${hsErrorCategory}`, statusCode, context);
  }
}

export class ConfigError extends AppError {
  constructor(message: string) {
    super(message, 'CONFIG_INVALID', 500);
  }
}
```

---

## 6. Convenciones

### Nombrado de archivos
- Siempre **lowercase** con separador de punto: `contact.job.ts`, `oracle.client.ts`
- Tests al lado del archivo: `contact.job.test.ts`
- Sufijos por rol: `.job.ts`, `.mapper.ts`, `.port.ts`, `.types.ts`, `.route.ts`, `.test.ts`

### Imports
- Usar `import type` para interfaces y tipos sin valor runtime
- Extensión `.js` obligatoria en todos los imports (requisito ESM)
- Orden: node builtins → dependencias externas → domain → features → shared

### TypeScript
- `strict: true` sin excepciones
- Zero `any` — si un tipo es desconocido, usar `unknown` y validar con zod o type guard
- Interfaces de domain comienzan con `I`: `IOracleClient`, `IHubSpotClient`, `ILogger`

### Logging y errores
- Cada error lleva un código rastreable: `ORACLE_404`, `HUBSPOT_RATE_LIMIT`, `QUEUE_DLQ`
- Los errores de API se buscan en documentación oficial por su código
- Dead letter queue registra payload completo para recovery manual

---

## 7. Flujo de un webhook (ejemplo: contact.creation)

```
1. HubSpot envía POST /webhook/hubspot
2. webhook.verify.ts valida firma HubSpot v2
3. webhook.route.ts parsea subscriptionType, deduplica, enqueue
4. Responde HTTP 200 OK inmediatamente
5. worker.ts dequeue → identifica job type → llama processContact(container, payload)
6. contact.job.ts:
   a. hubspot.getContactById(contactId)        ← IHubSpotClient
   b. contact.mapper.ts transforma a GuestProfile
   c. oracle.createGuestProfile(profile)        ← IOracleClient
   d. hubspot.updateContact(contactId, { id_oracle })
7. Si falla: exponential backoff retry (3 intentos)
8. Si agota reintentos: dead letter log con payload completo
9. Recovery manual: GET /sync-to-oracle/:hsId
```

---

## 8. Configuración TypeScript (tsconfig.json)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

---

## 9. Roadmap de implementación (fase 1: HS → Oracle)

### Sprint 0 — Scaffolding (fundación)
- [ ] Inicializar repo, package.json con `"type": "module"`
- [ ] tsconfig.json (strict, ESM, NodeNext)
- [ ] vitest.config.ts
- [ ] .gitignore (node_modules, dist, .env)
- [ ] shared/config/env.ts con schema zod (PORT dinámico, DATABASE_URL)
- [ ] shared/logger/logger.ts (dual mode)
- [ ] shared/errors/app.errors.ts
- [ ] container.ts (factory vacío)
- [ ] index.ts + infrastructure/http/server.ts (Express mínimo + health route)
- [ ] Railway: crear proyecto, vincular repo GitHub, configurar auto-deploy main
- [ ] Railway: configurar variables de entorno en dashboard
- [ ] Railway: generar dominio .railway.app, configurar health check path /health
- [ ] Verificar: push a main → deploy automático, GET /health responde 200

### Sprint 1 — Domain (tipos y contratos)
- [ ] domain/types/oracle.types.ts (basado en API specs del proyecto)
- [ ] domain/types/hubspot.types.ts
- [ ] domain/types/common.types.ts
- [ ] domain/ports/oracle.port.ts (interface IOracleClient)
- [ ] domain/ports/hubspot.port.ts (interface IHubSpotClient)
- [ ] domain/rules/company.rules.ts + tests
- [ ] Verificar: todos los tipos compilan, tests de rules pasan

### Sprint 2 — Infrastructure (clients)
- [ ] infrastructure/oracle/oracle.auth.ts (OAuth lifecycle)
- [ ] infrastructure/oracle/oracle.client.ts implements IOracleClient
- [ ] infrastructure/hubspot/hubspot.client.ts implements IHubSpotClient
- [ ] Tests de integración con HTTP mockeado
- [ ] Verificar: clients instancian y métodos respetan los ports

### Sprint 3 — Base de datos, Queue y Worker
- [ ] shared/db/schema.ts (Drizzle schema: jobs, dead_letter_jobs, sync_logs)
- [ ] shared/db/client.ts (Drizzle + postgres.js connection)
- [ ] shared/db/migrate.ts (migraciones al arranque)
- [ ] drizzle.config.ts + primera migración con drizzle-kit generate
- [ ] shared/queue/queue.repository.ts (enqueue/dequeue/complete/fail en PG)
- [ ] shared/queue/worker.ts (poll PG + backoff + dispatch)
- [ ] shared/dlq/dlq.repository.ts (insert/query/markResolved en PG)
- [ ] shared/logger/sync-log.repository.ts (persistir logs de sync en PG)
- [ ] Railway: agregar PostgreSQL addon, verificar DATABASE_URL autoinyectada
- [ ] Tests: enqueue/dequeue, retry con backoff, DLQ insert/query
- [ ] Verificar: worker poll PG, procesa, reintenta, persiste DLQ en PostgreSQL

### Sprint 4 — Feature Contact
- [ ] features/contact/contact.mapper.ts + tests
- [ ] features/contact/contact.job.ts + tests (con mocks)
- [ ] infrastructure/http/routes/webhook.route.ts (contact events)
- [ ] Cablear en container.ts
- [ ] Test end-to-end: webhook simulado → job → mock Oracle responde

### Sprint 5 — Feature Company
- [ ] features/company/company.mapper.ts + tests
- [ ] features/company/company.job.ts + tests
- [ ] Agregar company events al webhook router
- [ ] Verificar: company sin iata_code → Company, con iata_code → Agent

### Sprint 6 — Feature Deal
- [ ] features/deal/deal.mapper.ts + tests
- [ ] features/deal/deal.job.ts + tests (handshake contact, company, reserva)
- [ ] features/deal/deal.cancel.ts + tests
- [ ] infrastructure/http/routes/sync.route.ts (recovery manual)
- [ ] Agregar deal events al webhook router
- [ ] Verificar: flujo completo deal → reserva Oracle → confirmation number

### Sprint 7 — Feature Appointment (registro diario)
- [ ] features/appointment/appointment.mapper.ts + tests
      → Mapea a 4 tipos Oracle: ActivityBooking, GuestMessage, ServiceRequest, BillingCharge
- [ ] features/appointment/appointment.job.ts + tests
      → Requiere: dealId → Oracle reservationId (lookup del Deal asociado)
- [ ] infrastructure/oracle/oracle.client.ts — agregar 6 métodos nuevos:
      createActivityBooking, updateActivityBooking, createGuestMessage,
      createServiceRequest, updateServiceRequest, postBillingCharge
- [ ] Agregar appointment events al webhook router
- [ ] Verificar: appointment → 4 APIs Oracle según tipo de dato
- [ ] Verificar: actividades → Leisure Management
- [ ] Verificar: comentarios/incidencias → Guest Messages
- [ ] Verificar: mantención → Service Requests
- [ ] Verificar: comidas → Cashiering (postBillingCharges)

### Sprint 8 — Hardening
- [ ] infrastructure/http/middleware/webhook.verify.ts (firma HubSpot v3)
- [ ] infrastructure/http/middleware/error.handler.ts (middleware global)
- [ ] Deduplicación de webhooks (PostgreSQL UNIQUE constraint)
- [ ] Revisar todos los console.log → migrar a logger
- [ ] infrastructure/http/routes/dlq.route.ts (GET /admin/dlq, POST resolve/retry)
- [ ] Verificar: errores loggeados con código, DLQ registra payloads en PostgreSQL

---

## 10. Principios operativos

1. **Todo error tiene un código rastreable** — buscar en docs oficiales Oracle/HubSpot.
2. **No generar ni inferir información** — confirmar con el usuario si falta un dato.
3. **Verificar antes de enviar** — cada implementación se prueba con Vitest antes de integrar.
4. **Preferir documentación oficial** — Oracle OHIP docs y HubSpot API docs sobre internet libre.
5. **console.log estructurado** — cada log incluye contexto suficiente para diagnosticar.
6. **Zero `any`** — `unknown` + validación cuando el tipo no se conoce.

---

## 11. Diseño de tipos de domain

Los tipos de domain son la columna vertebral del proyecto. Viven en `domain/types/`
y no importan nada externo. Están basados en los schemas reales de Oracle OHIP
(`ApiOracleCRM.json`, `ApiOracleReservations.json`) y en las propiedades reales
del portal HubSpot de Clos Apalta (confirmadas marzo 2026).

### 11.1 Mapa de entidades

```
HubSpot              domain/ (nuestros tipos)       Oracle OHIP API
─────────            ──────────────────────          ──────────────
HsContact      →     GuestProfile             →     postGuestProfile (CRM)
HsDeal         →     OracleReservation         →     postReservation (Reservations)
HsCompany      →     CompanyProfile            →     postCompanyProfile (CRM)
HsAppointment  →     4 tipos Oracle:           →     4 APIs diferentes:
                      OracleActivityBooking           Leisure Management
                      OracleGuestMessage              Guest Messages
                      OracleServiceRequest            Service Requests
                      OracleBillingCharge             Cashiering
```

Cuatro objetos HubSpot, cuatro mappers:
- `contact.mapper.ts` convierte HsContact ↔ GuestProfile ↔ Oracle CRM payload
- `deal.mapper.ts` convierte HsDeal ↔ OracleReservation ↔ Oracle Reservations payload
- `company.mapper.ts` convierte HsCompany ↔ CompanyProfile ↔ Oracle CRM payload
- `appointment.mapper.ts` convierte HsAppointment → 4 tipos Oracle → 4 APIs diferentes

### 11.2 Tipos Oracle (domain/types/oracle.types.ts)

Basados en los schemas reales del API:

```
GuestProfile {
  givenName:       string         // Oracle: customer.givenName (max 40)
  surname:         string         // Oracle: customer.surname (max 40)
  email?:          string         // Oracle: emails.emailInfo[0].email
  phoneNumber?:    string         // Oracle: telephones[phoneType=Phone] (max 40)
  mobileNumber?:   string         // Oracle: telephones[phoneType=Mobile] (max 40)
  language?:       string         // Oracle: language (pattern: [a-zA-Z]{1,8})
  nationality?:    string         // Oracle: nationality.code (ISO country)
  birthDate?:      string         // Oracle: customer.birthDate (ISO date)
  address?:        OracleAddress  // Oracle: addresses.addressInfo[0]
  namePrefix?:     string         // Oracle: namePrefix (Mr., Mrs., etc.)
  vipCode?:        string         // Oracle: customer.vip.vipCode
  identifications?: OracleIdentification[]  // Pasaporte, RUT, etc.
  allergies?:      string         // Oracle: preferences o reservation comments
}

OracleAddress {
  addressLine:   string[]       // Oracle: max 4 lines, each max 80 chars
  cityName?:     string         // max 40
  postalCode?:   string         // max 15
  state?:        string         // max 20
  countryCode?:  string         // ISO 2-letter
}

OracleIdentification {
  idType:        string         // 'PASSPORT' | 'TAX_ID' | etc.
  idNumber:      string
}

CompanyProfile {
  companyName:   string         // Oracle: company.companyName (max 40)
  profileType:   'Company' | 'TravelAgent'  // Regla: Agencia → TravelAgent
  iataCode?:     string         // Oracle: iATAInfo.iATACompany (max 20)
  email?:        string         // Oracle: emails.emailInfo[0]
  phoneNumber?:  string         // Oracle: telephones[0]
  contactName?:  string         // Oracle: contact person name
}

OracleReservation {
  arrivalDate:       string     // ISO date: "2025-07-01"
  departureDate:     string     // ISO date: "2025-07-05"
  roomType:          string     // Oracle: roomRates[].roomType (max 20)
  ratePlanCode:      string     // Oracle: roomRates[].ratePlanCode (max 20)
  adults:            number     // Oracle: guestCounts.adults
  children:          number     // Oracle: guestCounts.children
  numberOfRooms:     number     // Oracle: roomStay.numberOfRooms
  roomId?:           string     // Oracle: roomStay.roomId (max 20)
  guestProfiles:     ReservationGuest[]
  travelAgentId?:    string     // Oracle Profile ID de la agencia
  sourceCode:        string     // Oracle: sourceOfSale.sourceCode (WLK,GDS,OTA,WSBE,HS)
  sourceType:        string     // Oracle: sourceOfSale.sourceType (default "PMS")
  reservationStatus: OracleResStatus
  paymentMethod?:    string     // Oracle: paymentMethod code
  isPseudoRoom:      boolean    // Oracle: pseudo room / master account flag
  currencyCode:      string     // ISO 4217 (default "CLP")
  amountBeforeTax?:  string     // Oracle usa string para amounts
  comments?:         string     // Oracle: reservation comments
}

OracleResStatus = 'Reserved' | 'InHouse' | 'CheckedOut' | 'Cancelled'
  // Mapeo desde HubSpot:
  //   Confirmada  → Reserved
  //   Hospedado   → InHouse
  //   Salida      → CheckedOut
  //   Cancelada   → Cancelled

ReservationGuest {
  oracleProfileId: string       // Oracle Profile ID del huésped
  isPrimary:       boolean      // true = huésped principal de la reserva
}

ReservationIds {
  internalId:        string     // reservationIdList[type="Reservation"].id
  confirmationId?:   string     // reservationIdList[type="Confirmation"].id
  cancellationId?:   string     // reservationIdList[type="CancellationNumber"].id
}

OracleProfileId {
  id:    string
  type:  'Profile' | 'CorporateId'
}

// ── Tipos para Appointment (registro diario) ──
// Un Appointment mapea a 4 APIs Oracle diferentes.

OracleActivityBooking {
  // Leisure Management API: postActivityBookingForProfile
  activityType:    string         // Código de actividad (ej: 'BIRDWATCH', 'TREK')
  status:          'Pending' | 'Completed' | 'Cancelled'
  profileId:       string         // Oracle guest profile ID
  reservationId:   string         // Oracle reservation ID
  hotelId:         string
}

OracleGuestMessage {
  // Guest Messages API: postGuestMessages
  messageText:     string         // Contenido del mensaje
  messageType?:    string         // Tipo: comment, incident, dietary, etc.
  reservationId:   string
  hotelId:         string
}

OracleServiceRequest {
  // Service Requests API: postServiceRequests
  description:     string         // Descripción del problema
  roomId?:         string         // Habitación afectada
  reservationId:   string
  hotelId:         string
}

OracleBillingCharge {
  // Cashiering API: postBillingCharges
  transactionCode: string         // Código de transacción (breakfast, lunch, dinner)
  description:     string         // Descripción del cargo
  amount?:         string         // Monto (si aplica)
  reservationId:   string
  hotelId:         string
}
```

### 11.3 Tipos HubSpot (domain/types/hubspot.types.ts)

Nombres internos confirmados del portal HubSpot de Clos Apalta (marzo 2026).

```
HsContact {
  // ── Propiedades estándar ──
  hs_object_id:          string        // HubSpot internal ID
  firstname:             string
  lastname:              string
  email?:                string | null
  phone?:                string | null
  mobilephone?:          string | null
  address?:              string | null
  city?:                 string | null

  // ── Propiedades custom — sync con Oracle ──
  fecha_de_nacimiento?:  string | null  // date → Oracle: birthDate
  hs_language?:          string | null  // enum → Oracle: language
  pais?:                 string | null  // enum → Oracle: nationality.code
  pasaporte?:            string | null  // → Oracle: identifications[PASSPORT]
  rut?:                  string | null  // → Oracle: identifications[TAX_ID]
  huesped_vip?:          string | null  // enum → Oracle: vip.vipCode
  allergies?:            string | null  // enum → Oracle: preferences/comments

  // ── Propiedades custom — IDs del bridge ──
  id_oracle?:            string | null  // Oracle Profile ID (escrito por el bridge)
}

HsDeal {
  // ── Propiedades estándar ──
  hs_object_id:          string
  dealname:              string
  createdate?:           string | null

  // ── Propiedades custom — sync con Oracle (reserva) ──
  check_in:              string         // date → Oracle: arrivalDate
  check_out:             string         // date → Oracle: departureDate
  room_type:             string         // enum → Oracle: roomType
                                        //   Casitas → CASITA, Pool Casitas → PLCASITA,
                                        //   Owners Casita → OWNERC, Villas → VILLAS
                                        //   ACCIÓN: actualizar enum en HubSpot (reemplazar Type 1/2/3)
  tipo_de_tarifa:        string         // enum → Oracle: ratePlanCode (siempre BAR)
                                        //   Half Board → BARHB, Overnight → BAROV, Full board → BARFB
  n_huespedes:           string         // string → parsear a number → Oracle: adults
  n_ninosas:             string         // string → parsear a number → Oracle: children
  cantidad_de_habitaciones?: string | null  // number → Oracle: numberOfRooms
  n_habitacion?:         string | null  // → Oracle: roomId
  estado_de_reserva:     string         // enum → Oracle: reservationStatus
                                        //   Confirmada → Reserved
                                        //   Hospedado  → InHouse
                                        //   Salida     → CheckedOut
                                        //   Cancelada  → Cancelled
  fuente_de_reserva?:    string | null  // enum → Oracle: sourceCode
                                        //   Código entre paréntesis es el sourceCode:
                                        //   Walk-in (WLK), GDS (GDS), OTA (OTA),
                                        //   Web Site Booking Engine (WSBE), Hubspot (HS)
  tipo_de_pago?:         string | null  // enum → Oracle: paymentMethod
                                        //   CASH, DP, CO, NON, MC, VI
  agencia_de_viajes?:    string | null  // → Link a TravelAgent profile
  es_pseudo_room?:       string | null  // enum: true/false → Oracle: pseudo room flag
  comentarios_del_huesped?: string | null // → Oracle: reservation comments

  // ── Propiedades custom — IDs del bridge ──
  id_oracle?:            string | null  // Oracle Reservation ID (internal)
  numero_de_reserva_?:   string | null  // Oracle Confirmation Number (nota: guion bajo final)
  id_synxis?:            string | null  // Synxis CRS external reference

  // ── Propiedades operativas (NO sync con Oracle) ──
  nights?:                              string | null  // Calculable de fechas
  numero_de_noches_de_estancia?:        string | null  // Duplicado de nights
  destino_anterior?:                    string | null
  estado_de_animo_general?:             string | null
  feedback_espontaneo?:                 string | null
  gastos_adicionales_del_dia?:          string | null
  nombre_chofer_clos_apalta?:           string | null
  numero_de_vuelo?:                     string | null
  observaciones_de_mejora?:             string | null
  preferencia_de_horario?:              string | null
  transporte?:                          string | null
  tienda_le_club?:                      string | null
  actividades_pendientes_o_reservadas?: string | null
  actividades_realizadas?:              string | null
  servicios_utilizados?:                string | null
  nivel_de_satisfaccion_actividades?:   string | null
}

HsCompany {
  // ── Propiedades estándar ──
  hs_object_id:          string
  name:                  string         // → Oracle: companyName
  domain?:               string | null
  phone?:                string | null  // → Oracle: telephones[0]

  // ── Propiedades custom — sync con Oracle ──
  email_agencia?:        string | null  // → Oracle: emails[0]
  nombre_agente?:        string | null  // → Oracle: contact name
  tipo_de_empresa?:      string | null  // enum: Agencia | Proveedor | CVR
                                        //   Agencia  → Oracle profileType: TravelAgent
                                        //   Proveedor → Oracle profileType: Company
                                        //   CVR      → Oracle profileType: Company
  iata_code?:            string | null  // → Oracle: iATAInfo.iATACompany

  // ── Propiedades custom — IDs del bridge ──
  id_oracle?:            string | null  // Oracle Profile ID (Company o TravelAgent)

  // ── Propiedades no sincronizadas ──
  hs_parent_company_id?: string | null  // HubSpot internal: casa matriz
}

HsAppointment {
  // Registro diario del huésped, vinculado a un Deal (reserva).
  // Dirección de sync: HubSpot → Oracle
  // Cada Appointment toca 4 APIs Oracle diferentes.

  hs_object_id:          string

  // ── Actividades → Oracle: Leisure Management API ──
  actividades_pendientes_o_reservadas?: string | null  // enum (14 actividades)
                                        // → postActivityBookingForProfile
  actividades_realizadas?:              string | null  // enum (14 actividades)
                                        // → putActivityBookingForProfile (status: completed)

  // ── Comentarios e incidencias → Oracle: Guest Messages API ──
  comentarios_del_huesped?:             string | null  // → postGuestMessages
  descripcion_de_la_incidencia?:        string | null  // → postGuestMessages (type: incident)
  cambios_dieteticos?:                  string | null  // → postGuestMessages (type: dietary)

  // ── Mantención → Oracle: Service Requests API ──
  comentarios_mantencion?:              string | null  // → postServiceRequests
  comentarios_mantencion_habitacion?:   string | null  // → postServiceRequests (room-specific)

  // ── Comidas consumidas → Oracle: Cashiering API ──
  descripcion_desayuno_consumido?:      string | null  // → postBillingCharges (breakfast txn code)
  descripcion_almuerzo_consumido?:      string | null  // → postBillingCharges (lunch txn code)
  descripcion_cena_consumida?:          string | null  // → postBillingCharges (dinner txn code)

  // Relación: vinculado a un Deal (reserva) vía asociación HubSpot
  // El mapper necesita: dealId → Oracle reservationId + guestProfileId
}

DealContactAssociation {
  contactId:  string
  labels:     string[]                  // Ej: ["Huésped Principal"]
}

WebhookEvent {
  objectId:          number
  subscriptionType:  WebhookSubscriptionType
  propertyName?:     string
  propertyValue?:    string
  occurredAt:        number             // Epoch ms
  attemptNumber:     number
}

WebhookSubscriptionType =
  | 'contact.creation'
  | 'contact.propertyChange'
  | 'contact.deletion'
  | 'deal.creation'
  | 'deal.propertyChange'
  | 'deal.deletion'
  | 'company.creation'
  | 'company.propertyChange'
  | 'company.deletion'
```

### 11.4 Tablas de mapeo (domain/types/mappings.ts)

Valores reales confirmados con LOV responses de la instancia Oracle (marzo 2026).
Resort code: CAR.

```
// ── Estado de reserva ──
ReservationStatusMap = {
  'Confirmada':  'Reserved',
  'Hospedado':   'InHouse',
  'Salida':      'CheckedOut',
  'Cancelada':   'Cancelled',
}

// ── Fuente de reserva → sourceCode ──
// El código entre paréntesis del enum HubSpot es el sourceCode Oracle
SourceCodeMap = {
  'Walk-in (WLK)':                        'WLK',
  'Global Distribution System (GDS)':     'GDS',
  'Online Travel Agency (OTA)':           'OTA',
  'Web Site Booking Engine (WSBE)':       'WSBE',
  'Hubspot (HS)':                         'HS',
}
// Alternativa: parsear el código entre paréntesis con regex: /\((\w+)\)$/

// ── Tipo de pago → Oracle paymentMethod ──
// NOTA: Oracle usa códigos diferentes a HubSpot para algunos métodos
PaymentMethodMap = {
  'Efectivo (CASH)':          'CASH',    // Oracle: CASH (TrxCode 9000)
  'Depósito (DP)':            'BTR',     // Oracle: BTR = Bank Transfer (TrxCode 9400)
  'Cuenta por Cobrar (CO)':   'INV',     // Oracle: INV = Direct Bill (TrxCode 9800)
  'None (NON)':               null,      // No enviar a Oracle — sin método de pago
  'MasterCard (MC)':          'MC',      // Oracle: MC (TrxCode 9100)
  'Visa (VI)':                'VA',      // Oracle: VA — ¡NO VI! (TrxCode 9200)
}
// Oracle también tiene: AX (American Express), MCO/VAO/AXO (offline variants)
// Estos no están en HubSpot pero podrían aparecer en sync Oracle→HubSpot (fase 2)

// ── Tipo de empresa → profileType ──
CompanyTypeMap = {
  'Agencia':    'TravelAgent',
  'Proveedor':  'Company',
  'CVR':        'Company',
}

// ── Room Type → Oracle roomType ──
// Datos reales de getRoomTypesLOV. PseudoYn=N son habitaciones reales.
RoomTypeMap = {
  'Casitas':         'CASITA',     // 4 habitaciones, Class: ALL
  'Pool Casitas':    'PLCASITA',   // 6 habitaciones, Class: ALL
  'Owners Casita':   'OWNERC',     // 1 habitación, Class: ALL
  'Villas':          'VILLAS',     // Class: SUI (suite)
}
// ACCIÓN: Actualizar enum room_type en HubSpot para que use estos 4 valores
// (reemplazar Type 1/2/3 por Casitas/Pool Casitas/Owners Casita/Villas)
// Pseudo rooms (PI, PM) no se usan para reservas de huéspedes regulares

// ── Tipo de tarifa → Oracle ratePlanCode ──
// Siempre usar los códigos BAR directos. Los BKG/GLOVE se manejan fuera del bridge.
RatePlanMap = {
  'Half Board':  'BARHB',   // Half Board Rate (media pensión)
  'Overnight':   'BAROV',   // OVERNIGHT (solo alojamiento)
  'Full board':  'BARFB',   // Full Board Rate (pensión completa)
}
// Rate plans adicionales en Oracle no mapeados desde HubSpot:
//   BAROVERN (Overnight w/ breakfast), BARRO (Flexible), BARBB (Flexible w/ bkf),
//   BARNR (Non-Refundable), BAREB (Early Bird), NEG1/NEG2 (Negotiated 10%/20%),
//   COMPL (Complimentary), STAFF (Staff Rate), DAY (Daily), PSE (Pseudo),
//   BKGFB/BKGHB/BKGON (Booking.com), GLOVEFB/GLOVEHB/GLOVEON (Glove Travel)

// ── Transaction codes de comidas → postBillingCharges ──
// Siempre Outlet 1 (restaurante principal). Resort: CAR.
MealTransactionCodeMap = {
  breakfast: '2004',   // [Outlet 1] - Breakfast Food (FNB/FOD)
  lunch:     '2010',   // [Outlet 1] - Lunch Food (FNB/FOD)
  dinner:    '2020',   // [Outlet 1] - Dinner Food (FNB/FOD)
}
// Outlet 2: breakfast=2100, lunch=2110, dinner=2120
// Outlet 3: breakfast=2200, lunch=2210 (no dinner)
// Genérico: 2000 (Restaurant Food) — si no se sabe la comida específica

// ── Activity types ── (comentados: necesitan configuración en Oracle)
// ActivityTypeMap = {
//   'Birdwatching':                '???',  // No configurado en Oracle
//   'Trekking Casa Parrón':        '???',
//   'Trekking Las Pircas':         '???',
//   'Cellar Tour':                 '???',
//   'Cooking Show':                '???',
//   'Cocktail Class':              '???',
//   'Tennis Court':                '???',
//   'Tennis Lessons':              '???',
//   'Masajes':                     '???',
//   'Horseback Riding':            '???',  // TXN 5101 existe en Cashiering
//   'Stargazing':                  '???',
//   'Blind Tasting':               '???',
//   'Chilean Asado':               '???',
//   'Vendimia':                    '???',
// }
// STATUS: Oracle solo tiene 3 activity types genéricos (*CSL*, BROCHURE, OUT).
//         Las 14 actividades del hotel necesitan ser creadas en Oracle.
//         Mientras tanto, enviar como Guest Messages con el nombre de la actividad.

// ── Dietary preferences ── (comentados: necesitan configuración en Oracle)
// DietaryPreferenceMap = {
//   // getDietaryPreferencesLOV retornó 0 items.
//   // El campo allergies de HubSpot no tiene destino en Oracle actualmente.
//   // Mientras tanto, enviar como Guest Message con typeOfMessage: 'dietary'.
// }

// ── Service request codes ── (comentados: necesitan configuración en Oracle)
// ServiceRequestCodeMap = {
//   // getServiceRequestCodesLOV retornó 0 items.
//   // Los datos de mantención se envían como Track It Items con description libre.
//   // Cuando se configuren los códigos, descomentar y mapear.
// }
```

### 11.5 Tipos comunes (domain/types/common.types.ts)

```
Result<T, E> =
  | { ok: true;  data: T }
  | { ok: false; error: E }

JobType =
  | 'contact.create'
  | 'contact.update'
  | 'deal.create'
  | 'deal.update'
  | 'deal.delete'
  | 'company.create'
  | 'company.update'
  | 'appointment.create'    // ⏳ Pendiente definir scope
  | 'appointment.update'    // ⏳ Pendiente definir scope

SyncDirection = 'hubspot-to-oracle' | 'oracle-to-hubspot'
```

### 11.6 Reglas de negocio (domain/rules/)

```
resolveOracleCompanyType(tipoDeEmpresa: string, iataCode?: string): 'Company' | 'TravelAgent'
  → Si iataCode presente → 'TravelAgent'
  → Si tipoDeEmpresa === 'Agencia' → 'TravelAgent'
  → Default → 'Company'  (cubre Proveedor y CVR)

isPrimaryGuest(labels: string[]): boolean
  → true si labels incluye 'Huésped Principal' (case-insensitive)

mapReservationStatus(hsStatus: string): OracleResStatus
  → Usa ReservationStatusMap, throw si valor desconocido

parseSourceCode(hsValue: string): string
  → Extrae código entre paréntesis: "Walk-in (WLK)" → "WLK"

parsePaymentMethod(hsValue: string): string
  → Extrae código entre paréntesis: "Visa (VI)" → "VI"

parseNumberFromString(value: string): number
  → parseInt(value, 10), throw si NaN (para n_huespedes, n_ninosas)

isRetryableError(statusCode: number): boolean
  → true si statusCode in [429, 500, 502, 503, 504]

parseOracleReservationIds(reservationIdList: unknown[]): ReservationIds
  → Extrae internalId, confirmationId, cancellationId del array
```

### 11.7 Propiedades pendientes y acciones requeridas

```
⏳ ACCIONES PENDIENTES EN HUBSPOT (no bloquean Sprint 0-5):

1. room_type: actualizar enum en HubSpot
   → Reemplazar "Type 1/2/3" por: Casitas, Pool Casitas, Owners Casita, Villas
   → Los códigos Oracle ya están mapeados (CASITA, PLCASITA, OWNERC, VILLAS)
   → Bloquea: Sprint 6 (Deal mapper)

⏳ ACCIONES PENDIENTES EN ORACLE (requieren admin de Oracle Back Office):

2. Activity Types: crear las 14 actividades del hotel
   → Birdwatching, Trekking Casa Parrón, Trekking Las Pircas, Cellar Tour,
     Cooking Show, Cocktail Class, Tennis Court, Tennis Lessons, Masajes,
     Horseback Riding, Stargazing, Blind Tasting, Chilean Asado, Vendimia
   → Actualmente solo hay 3 genéricos (*CSL*, BROCHURE, OUT)
   → Workaround temporal: enviar como Guest Messages con nombre de actividad
   → Bloquea: Sprint 7 (Appointment mapper, módulo Leisure)

3. Dietary Preferences: crear preferencias dietéticas
   → getDietaryPreferencesLOV retornó 0 items
   → Workaround temporal: enviar allergies como Guest Message
   → Bloquea: Sprint 4 (Contact mapper, campo allergies — opcional)

4. Service Request Codes: crear códigos de service request
   → getServiceRequestCodesLOV retornó 0 items
   → Workaround temporal: postTrackItItems acepta description sin código
   → Bloquea: Sprint 7 (Appointment mapper, módulo mantención — opcional)

✅ RESUELTOS (datos reales de LOV, marzo 2026):
- RoomTypeMap: 4 room types reales (CASITA, PLCASITA, OWNERC, VILLAS)
- RatePlanMap: 3 BAR codes (BARHB, BAROV, BARFB) — siempre usar BAR directos
- PaymentMethodMap: 9 métodos con traducción (VI→VA, DP→BTR, CO→INV)
- MealTransactionCodeMap: Outlet 1 (breakfast=2004, lunch=2010, dinner=2020)
- HsAppointment: tipos definidos, 4 APIs Oracle confirmadas
- tipo_de_empresa: Agencia→TravelAgent, Proveedor/CVR→Company
- estado_de_reserva: Confirmada→Reserved, Hospedado→InHouse, etc.
- fuente_de_reserva: sourceCode entre paréntesis confirmado
- n_ninosas: campo creado en HubSpot para children
```

---

## 12. Diseño de ports/interfaces

Los ports definen los contratos que infrastructure/ debe implementar.
Viven en `domain/ports/` y solo usan tipos de `domain/types/`.

### 12.1 IOracleClient (domain/ports/oracle.port.ts)

```
interface IOracleClient {
  // ── Perfiles Guest ──
  createGuestProfile(profile: GuestProfile): Promise<Result<string, OracleApiError>>
  updateGuestProfile(oracleId: string, profile: Partial<GuestProfile>): Promise<Result<void, OracleApiError>>
  getGuestProfile(oracleId: string): Promise<Result<GuestProfile, OracleApiError>>

  // ── Perfiles Company / TravelAgent ──
  createCompanyProfile(profile: CompanyProfile): Promise<Result<string, OracleApiError>>
  updateCompanyProfile(oracleId: string, profile: Partial<CompanyProfile>): Promise<Result<void, OracleApiError>>

  // ── Reservaciones ──
  createReservation(reservation: OracleReservation): Promise<Result<ReservationIds, OracleApiError>>
  updateReservation(oracleId: string, reservation: Partial<OracleReservation>): Promise<Result<ReservationIds, OracleApiError>>
  getReservation(oracleId: string): Promise<Result<OracleReservationResponse, OracleApiError>>
  cancelReservation(oracleId: string, reasonCode: string): Promise<Result<string | null, OracleApiError>>

  // ── Appointment: Leisure Management ──
  createActivityBooking(booking: OracleActivityBooking): Promise<Result<string, OracleApiError>>
  updateActivityBooking(bookingId: string, booking: Partial<OracleActivityBooking>): Promise<Result<void, OracleApiError>>

  // ── Appointment: Guest Messages ──
  createGuestMessage(message: OracleGuestMessage): Promise<Result<string, OracleApiError>>

  // ── Appointment: Service Requests ──
  createServiceRequest(request: OracleServiceRequest): Promise<Result<string, OracleApiError>>
  updateServiceRequest(requestId: string, request: Partial<OracleServiceRequest>): Promise<Result<void, OracleApiError>>

  // ── Appointment: Cashiering ──
  postBillingCharge(charge: OracleBillingCharge): Promise<Result<void, OracleApiError>>
}
```

Cada método retorna Result — nunca lanza. Los jobs deciden:
- ok → continuar flujo
- error retryable (429, 5xx) → reintentar
- error permanente (400, 404) → DLQ

### 12.2 IHubSpotClient (domain/ports/hubspot.port.ts)

```
interface IHubSpotClient {
  // ── Contactos ──
  getContactById(contactId: string): Promise<Result<HsContact, HubSpotApiError>>
  updateContact(contactId: string, properties: Partial<HsContact>): Promise<Result<void, HubSpotApiError>>

  // ── Deals ──
  getDealById(dealId: string): Promise<Result<HsDeal, HubSpotApiError>>
  updateDeal(dealId: string, properties: Partial<HsDeal>): Promise<Result<void, HubSpotApiError>>
  getArchivedDealById(dealId: string): Promise<Result<HsDeal | null, HubSpotApiError>>

  // ── Companies ──
  getCompanyById(companyId: string): Promise<Result<HsCompany, HubSpotApiError>>
  updateCompany(companyId: string, properties: Partial<HsCompany>): Promise<Result<void, HubSpotApiError>>

  // ── Asociaciones ──
  getAssociatedContacts(dealId: string): Promise<Result<DealContactAssociation[], HubSpotApiError>>
  getCompanyByDealId(dealId: string): Promise<Result<HsCompany | null, HubSpotApiError>>
}
```

### 12.3 ILogger (domain/ports/logger.port.ts)

```
interface ILogger {
  info(message: string, meta?: Record<string, unknown>): void
  warn(message: string, meta?: Record<string, unknown>): void
  error(message: string, meta?: Record<string, unknown>): void
}
```

### 12.4 Container (inyección manual)

```
interface Container {
  oracle:   IOracleClient
  hubspot:  IHubSpotClient
  logger:   ILogger
  config:   AppConfig
}
```

La función `createContainer()` en `container.ts` instancia los clients reales
y retorna el Container. Los jobs reciben `Container` como primer parámetro.
Los tests pasan un Container con mocks.

---

## 13. Diseño del queue/worker

### 13.1 Tipo Job

```
Job {
  id:            string                // UUID generado al enqueue
  type:          JobType               // 'contact.create' | 'deal.update' | etc.
  payload:       { objectId: string }  // El HubSpot object ID
  attempts:      number                // Empieza en 0, incrementa por fallo
  maxAttempts:   number                // Default: 3
  createdAt:     Date
  lastError?:    string                // Mensaje del último fallo
  nextRetryAt?:  Date                  // Calculada con backoff
}
```

### 13.2 Cola en PostgreSQL (tabla jobs)

```
Tabla: jobs

  id              TEXT PRIMARY KEY       -- UUID generado al enqueue
  type            TEXT NOT NULL          -- 'contact.create', 'deal.update', etc.
  object_id       TEXT NOT NULL          -- HubSpot object ID
  status          TEXT DEFAULT 'pending' -- 'pending' | 'processing' | 'completed' | 'failed'
  attempts        INTEGER DEFAULT 0
  max_attempts    INTEGER DEFAULT 3
  last_error      TEXT
  next_retry_at   TIMESTAMPTZ           -- Null = disponible, futuro = esperando backoff
  created_at      TIMESTAMPTZ DEFAULT now()
  updated_at      TIMESTAMPTZ DEFAULT now()

Índices: (status, next_retry_at), object_id

Repositorio (shared/queue/queue.repository.ts):
  - enqueue(job): inserta con status 'pending'
  - dequeue(): SELECT ... WHERE status='pending' AND next_retry_at <= now()
               ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED
               → UPDATE status='processing' → retorna el job
  - complete(jobId): UPDATE status='completed'
  - fail(jobId, error): incrementa attempts, calcula next_retry_at con backoff
               → Si attempts >= max_attempts → mover a dead_letter_jobs
  - size(): COUNT(*) WHERE status IN ('pending', 'processing')

Ventajas sobre in-memory:
  - Sobrevive redeploys y crashes
  - FOR UPDATE SKIP LOCKED previene procesamiento duplicado
  - Estado de cada job es queryable con SQL
  - Dedup: UNIQUE constraint en (object_id, type) WHERE status = 'pending'

Límites:
  - Max pending: 1000 (validado antes de INSERT)
  - Concurrencia: 1 (worker secuencial, LIMIT 1)
```

### 13.3 Retry policy

```
Estrategia: Exponential backoff base 2

  Intento 1 (primer fallo):    espera 2 segundos     → 2^(0+1) = 2s
  Intento 2 (segundo fallo):   espera 8 segundos     → 2^(1+1) × 2 = 8s
  Intento 3 (tercer fallo):    espera 32 segundos    → 2^(2+1) × 4 = 32s
  Intento 4:                   NO — va a Dead Letter

Fórmula: delay = 2^(attempt+1) segundos

Errores retryable:
  - HTTP 429 (Rate Limit — HubSpot y Oracle)
  - HTTP 500, 502, 503, 504 (Server Error)
  - Timeout (ECONNABORTED, ETIMEDOUT)
  - Network error (ECONNREFUSED, ENOTFOUND)

Errores NO retryable (directo a DLQ):
  - HTTP 400 (Bad Request — payload inválido)
  - HTTP 401 (Unauthorized — credenciales malas, requiere intervención)
  - HTTP 404 (Not Found — recurso no existe)
  - HTTP 403 (Forbidden)
  - Zod validation error (datos del webhook malformados)
```

### 13.4 Dead letter queue (PostgreSQL)

```
Almacenamiento: PostgreSQL (Railway addon, tabla dead_letter_jobs)
ORM: Drizzle (type-safe queries, migraciones con drizzle-kit)
Repositorio: shared/dlq/dlq.repository.ts (implements IDlqRepository)

Columnas de la tabla dead_letter_jobs:
  id            TEXT PRIMARY KEY       -- UUID del job
  job_type      TEXT                   -- "contact.create", "deal.update", etc.
  object_id     TEXT                   -- HubSpot object ID
  payload       JSONB                  -- Job completo (tipado, queryable)
  error_code    TEXT                   -- "ORACLE_404", "HUBSPOT_RATE_LIMIT", etc.
  first_error   TEXT                   -- Mensaje del primer fallo
  last_error    TEXT                   -- Mensaje del último fallo
  attempts      INTEGER                -- Número de intentos realizados
  status        TEXT DEFAULT 'pending' -- 'pending' | 'resolved' | 'ignored'
  created_at    TIMESTAMPTZ            -- Timestamp de creación
  failed_at     TIMESTAMPTZ            -- Timestamp del último fallo
  resolved_at   TIMESTAMPTZ            -- Timestamp de resolución (null si pending)
  resolved_by   TEXT                   -- 'manual' | 'sync-endpoint' | null

Índices: status, job_type, object_id, created_at

Recovery:
  GET  /sync-to-oracle/:hsId         → re-ejecuta job manualmente
  GET  /admin/dlq                    → lista jobs pendientes
  POST /admin/dlq/:jobId/resolve     → marca como resuelto
  POST /admin/dlq/:jobId/retry       → re-encola para reintento

Ver sección 21 para schema Drizzle completo y las 3 tablas.
```

### 13.5 Deduplicación de webhooks

```
Problema: HubSpot envía múltiples eventos para el mismo objeto cuando
se modifican varias propiedades simultáneamente.

Solución:
  - Key: "objectId:subscriptionType" (ej: "12345:contact.propertyChange")
  - Almacenamiento: Map<string, number> (key → timestamp en ms)
  - TTL: 10 segundos
  - Al recibir un webhook, verificar si la key existe y no expiró
  - Si existe → ignorar (no enqueue), responder 200 OK
  - Si no existe → enqueue y registrar en el Map
  - Limpieza: cada 60 segundos, eliminar entradas > 10s de antigüedad
```

### 13.6 Worker

```
Configuración:
  - Poll interval: 500ms
  - Concurrencia: 1 (secuencial)
  - Graceful shutdown: al recibir SIGTERM, deja terminar el job actual

Ciclo:
  1. Verificar si hay job en pending con nextRetryAt <= now
  2. Si hay → dequeue, mover a processing, dispatch según type
  3. Si éxito → complete(jobId)
  4. Si fallo → fail(jobId, error) → retry o DLQ
  5. Si no hay jobs → esperar poll interval
```

---

## 14. Seguridad

### 14.1 HTTPS
- TLS automático provisto por Railway. Dominio {service}.railway.app con certificado gestionado.
- No se requiere ngrok ni túnel externo.
- Railway health checks originan desde hostname `healthcheck.railway.app` — permitir en middleware.

### 14.2 Verificación de firma HubSpot (v3)
- Middleware: webhook.verify.ts
- Algoritmo: HMAC-SHA256
- Input: requestMethod + requestUri + requestBody + timestamp
- Secret: HUBSPOT_CLIENT_SECRET
- Header de firma: X-HubSpot-Signature-v3
- Header de timestamp: X-HubSpot-Request-Timestamp
- Rechazar si timestamp > 5 minutos (protección contra replay attacks)
- Si firma inválida → HTTP 401, no se procesa

### 14.3 Validación de payload (zod)
- Schema de webhook events en la ruta
- objectId, subscriptionType son requeridos
- subscriptionType debe ser uno del enum definido
- Payload malformado → HTTP 400, no entra a la cola
- Nunca se usa objectId en queries SQL ni en eval/exec

### 14.4 Protección de cola
- Max queue size: 1000 jobs
- Si la cola se llena → HTTP 503 Service Unavailable + log critical
- Worker secuencial (1 job a la vez) → sin race conditions en Oracle

### 14.5 Oracle OAuth — ciclo de vida del token
- Token se obtiene al arranque del servidor
- Se renueva proactivamente 60 segundos antes de expirar
- Si Oracle retorna 401 → refrescar token 1 vez y reintentar el request
- Si falla de nuevo → error permanente (no retryable)
- Credenciales solo en .env, nunca en logs ni en payloads de error

### 14.6 Sanitización de respuestas y logs
- error.handler.ts: nunca expone stack traces ni Oracle IDs al caller externo
- Webhook response: solo HTTP status code (200, 400, 401, 503)
- Health endpoint: solo { status, uptime, queueSize } — sin config ni secrets
- Logs internos: detalle completo (error code, Oracle response, HubSpot response)
- NUNCA loguear: tokens, secrets, datos personales (nombre, email, pasaporte)

### 14.7 Qué se loguea

```
SE LOGUEA:
  - objectId (HubSpot ID del objeto)
  - subscriptionType (tipo de evento)
  - Oracle response HTTP status
  - Oracle error codes (o:errorCode del response)
  - HubSpot error category
  - Tiempos de respuesta (ms)
  - Job lifecycle: enqueue, dequeue, complete, fail, dlq

NO SE LOGUEA:
  - HUBSPOT_ACCESS_TOKEN
  - ORACLE_CLIENT_SECRET / CLIENT_ID
  - Bodies completos de request/response (solo en NODE_ENV=development)
  - Datos personales: nombre, email, teléfono, pasaporte
  - Oracle tokens de autenticación
```

---

## 15. Rate limits

Rate limits reales que impactan la retry policy y el diseño del worker.
Fuentes: documentación oficial Oracle OHIP y HubSpot Developer Docs.

### 15.1 Oracle OHIP — límites documentados

```
Fuente: https://docs.oracle.com/en/industries/hospitality/integration-platform/ohipu/c_limits.htm

Property APIs (CRM, Reservations, etc.):
  - Sin límite numérico publicado por request/segundo
  - Oracle aplica throttling dinámico para proteger operaciones del hotel
  - Cuando se excede → HTTP 429 con header Retry-After
  - Recomendación Oracle: cachear datos que cambian poco (ej: ListOfValues)

Streaming API:
  - Hasta 12 requests/minuto para gestión del stream
  - Bursts cortos de hasta 100 requests/minuto permitidos

Async APIs:
  - Máximo 250 requests/minuto por aplicación por entorno (POST)
  - Requests idénticos requieren 30 minutos entre submissions

Business Events polling:
  - Máximo 20 mensajes por dequeue (parámetro "limit", max: 20)
```

### 15.2 HubSpot — límites documentados

```
Fuente: https://developers.hubspot.com/docs/developer-tooling/platform/usage-guidelines

Private Apps (lo que usamos):
  - Free/Starter: 100 requests por cada 10 segundos
  - Professional/Enterprise: 190 requests por cada 10 segundos
  - Con API Limit Increase pack: hasta 250 por cada 10 segundos

Daily limits (compartido entre todas las apps de la cuenta):
  - Free/Starter: 250,000 requests/día
  - Professional/Enterprise: 500,000 requests/día

CRM Search API (límite separado):
  - 5 requests por segundo (no por 10 segundos)

Cuando se excede:
  - HTTP 429 con headers:
    X-HubSpot-RateLimit-Daily
    X-HubSpot-RateLimit-Daily-Remaining
    X-HubSpot-RateLimit-Interval-Milliseconds
```

### 15.3 Impacto en nuestro diseño

```
Con ~10-50 eventos/día y procesamiento secuencial (1 job a la vez),
estamos muy lejos de los límites de ambas APIs.

Un processDeal típico hace ~6-8 llamadas API en total:
  - 1 getDealById (HubSpot)
  - 1 getAssociatedContacts (HubSpot)
  - 1-3 getContactById (HubSpot, por cada contacto)
  - 1 getCompanyByDealId (HubSpot)
  - 1 createReservation (Oracle)
  - 1 updateDeal (HubSpot)
  - 1 updateContact (HubSpot)

Peor caso: 50 deals/día × 8 calls = 400 calls/día total.
Esto es 0.08% del límite diario de HubSpot Free (250,000).

Acción: No necesitamos rate limiting proactivo en esta fase.
Basta con respetar el 429 + Retry-After en la retry policy ya diseñada.
Si en el futuro el volumen crece a >500 eventos/día, agregar
un token bucket en shared/rate-limiter/ con ventana de 10 segundos.
```

---

## 16. Health check detallado

### 16.1 Endpoint: GET /health

```
Response (HTTP 200 si todo ok, HTTP 503 si algo falla):

{
  "status":      "healthy" | "degraded" | "unhealthy",
  "uptime":      number (segundos desde start),
  "timestamp":   ISO string,
  "version":     string (del package.json),
  "checks": {
    "oracle":    { "status": "ok" | "error", "latencyMs": number, "lastCheck": ISO },
    "hubspot":   { "status": "ok" | "error", "latencyMs": number, "lastCheck": ISO },
    "queue":     { "status": "ok" | "warning" | "error", "pending": number, "dlqSize": number }
  }
}
```

### 16.2 Qué valida cada check

```
oracle:
  - Intenta GET /hotels/{hotelId} con el token actual
  - Si HTTP 200 → "ok"
  - Si HTTP 401 → intenta refresh token, si funciona → "ok", si no → "error"
  - Si timeout o network error → "error"
  - NO se ejecuta en cada request — se cachea 60 segundos

hubspot:
  - Intenta GET /crm/v3/objects/contacts?limit=1
  - Si HTTP 200 → "ok"
  - Si HTTP 401 → "error" (token inválido, intervención manual)
  - Se cachea 60 segundos

queue:
  - pending < 100 → "ok"
  - pending entre 100 y 500 → "warning"
  - pending > 500 o queue llena → "error"
  - dlqSize se reporta siempre (jobs fallidos acumulados)
```

### 16.3 Reglas de status agregado

```
"healthy":   todos los checks en "ok"
"degraded":  al menos un check en "warning" pero ninguno en "error"
"unhealthy": al menos un check en "error"

HTTP status:
  "healthy"   → 200
  "degraded"  → 200
  "unhealthy" → 503
```

### 16.4 Qué NO expone /health

```
- Credenciales o tokens
- Oracle IDs internos
- Datos de huéspedes
- Configuración del .env
- Stack traces
```

### 16.5 Integración con Railway

```
Railway verifica /health SOLO al inicio del deploy, antes de rutear tráfico.
NO hace monitoreo continuo después.

Configuración en Railway:
  - Settings → Healthcheck Path: /health
  - Railway usa el hostname "healthcheck.railway.app" para las peticiones
  - El middleware debe permitir este hostname (no rechazar por Host header)

Para monitoreo continuo post-deploy:
  - Usar Uptime Kuma (template disponible en Railway marketplace)
  - O cron externo haciendo curl al dominio .railway.app/health
```

---

## 17. Catálogo de errores

Códigos de error internos del puente, mapeados a las respuestas reales
de Oracle OHIP y HubSpot. Cada error tiene un código rastreable y una acción.

### 17.1 Errores Oracle OHIP

Estructura de error Oracle (del schema exceptionDetailType):
```
{
  "type":        "URI que identifica el tipo de problema",
  "title":       "Resumen legible del problema",
  "status":      number (HTTP status),
  "detail":      "Descripción específica de esta ocurrencia",
  "o:errorCode": "Código de error de aplicación Oracle",
  "o:errorPath": "Path al campo/recurso problemático",
  "o:errorDetails": [ ...errores anidados... ]
}
```

```
Código interno          | HTTP | Causa típica                     | Acción
────────────────────────|──────|──────────────────────────────────|────────────────────
ORACLE_400_BAD_REQUEST  | 400  | Payload inválido, campo faltante | DLQ + log o:errorPath
ORACLE_401_UNAUTHORIZED | 401  | Token expirado o inválido        | Refresh token, retry 1x
ORACLE_403_FORBIDDEN    | 403  | Sin permisos para la operación   | DLQ + alertar
ORACLE_404_NOT_FOUND    | 404  | Profile/Reservation no existe    | DLQ + log oracleId
ORACLE_405_METHOD       | 405  | Método HTTP no permitido         | Bug en client → fix
ORACLE_406_NOT_ACCEPT   | 406  | Accept header incorrecto         | Bug en client → fix
ORACLE_413_TOO_LARGE    | 413  | Request body excede límite       | DLQ + reducir payload
ORACLE_429_RATE_LIMIT   | 429  | Throttling                       | Retry con Retry-After
ORACLE_500_SERVER       | 500  | Error interno Oracle             | Retry (backoff)
ORACLE_502_GATEWAY      | 502  | Bad gateway                      | Retry (backoff)
ORACLE_503_UNAVAILABLE  | 503  | Servicio no disponible           | Retry (backoff)
ORACLE_TIMEOUT          | —    | ECONNABORTED / ETIMEDOUT         | Retry (backoff)
ORACLE_NETWORK          | —    | ECONNREFUSED / ENOTFOUND         | Retry (backoff)
ORACLE_TOKEN_REFRESH    | —    | Refresh de token falló           | DLQ + alertar
```

### 17.2 Errores HubSpot

```
Código interno          | HTTP | Causa típica                     | Acción
────────────────────────|──────|──────────────────────────────────|────────────────────
HUBSPOT_400_BAD_REQUEST | 400  | Propiedad inexistente o inválida | DLQ + log propertyName
HUBSPOT_401_UNAUTHORIZED| 401  | Token expirado o revocado        | DLQ + alertar (manual)
HUBSPOT_403_FORBIDDEN   | 403  | Scope insuficiente               | DLQ + verificar scopes
HUBSPOT_404_NOT_FOUND   | 404  | Objeto eliminado o ID inválido   | DLQ + log objectId
HUBSPOT_409_CONFLICT    | 409  | Conflicto de concurrencia        | Retry 1x
HUBSPOT_429_RATE_LIMIT  | 429  | Rate limit excedido              | Retry con Retry-After
HUBSPOT_500_SERVER      | 500  | Error interno HubSpot            | Retry (backoff)
HUBSPOT_502_GATEWAY     | 502  | Bad gateway                      | Retry (backoff)
HUBSPOT_503_UNAVAILABLE | 503  | Servicio no disponible           | Retry (backoff)
HUBSPOT_TIMEOUT         | —    | Timeout de request               | Retry (backoff)
HUBSPOT_NETWORK         | —    | Error de red                     | Retry (backoff)
```

### 17.3 Errores internos del puente

```
Código interno          | Causa                            | Acción
────────────────────────|──────────────────────────────────|────────────────────
CONFIG_INVALID          | Variable de entorno faltante     | Server no arranca
QUEUE_FULL              | Cola alcanzó 1000 jobs           | HTTP 503 al webhook
QUEUE_DLQ               | Job agotó reintentos             | Insert en dead_letter_jobs (PG)
WEBHOOK_SIGNATURE_FAIL  | Firma HubSpot v3 inválida        | HTTP 401 + log IP
WEBHOOK_PAYLOAD_INVALID | Payload no pasa validación zod   | HTTP 400 + log body
MAPPER_VALIDATION       | Datos insuficientes para mapear  | DLQ + log campos faltantes
JOB_NO_CONTACTS         | Deal sin contactos asociados     | Retry (pueden llegar)
JOB_NO_COMPANY_NAME     | Company sin nombre               | Log warning, omitir company
```

### 17.4 Cómo se loguea un error

```
Formato en producción (JSON):
{
  "timestamp":  "2025-07-15T14:30:00.000Z",
  "level":      "error",
  "code":       "ORACLE_400_BAD_REQUEST",
  "message":    "Failed to create guest profile",
  "jobId":      "uuid-del-job",
  "jobType":    "contact.create",
  "objectId":   "12345",
  "attempt":    2,
  "oracleError": {
    "title":      "Bad Request",
    "detail":     "Missing required field: surname",
    "errorCode":  "INVALID_PARAMETER",
    "errorPath":  "guestDetails.customer.surname"
  },
  "durationMs": 340
}
```

---

## 18. Estrategia de monitoreo/alertas

### 18.1 Monitoreo en fase 1 (sin infraestructura extra)

```
Todo basado en los logs estructurados JSON que ya producimos.
No requiere servicios externos adicionales.

Métricas clave (extraíbles de los logs):

1. Jobs completados / fallidos por hora
   → Filtrar logs por level="info" code="JOB_COMPLETE" vs level="error"

2. Latencia promedio por tipo de job
   → Campo durationMs en cada log de job completado

3. DLQ size (acumulado)
   → SELECT COUNT(*) FROM dead_letter_jobs WHERE status='pending'

4. Oracle / HubSpot availability
   → Filtrar errores ORACLE_5xx y HUBSPOT_5xx por hora

5. Queue depth
   → Campo pending en /health (poll cada 60s)
```

### 18.2 Alertas (condiciones que requieren atención)

```
ALERTA CRÍTICA (requiere acción inmediata):
  - /health retorna "unhealthy" (503)
  - DLQ tiene >5 jobs en 1 hora
  - ORACLE_401 después de token refresh (credenciales revocadas)
  - HUBSPOT_401 (token revocado)
  - QUEUE_FULL (cola llena — algo inunda webhooks)

ALERTA WARNING (revisar en el día):
  - /health retorna "degraded"
  - Job retry rate >30% en última hora
  - Latencia promedio Oracle >5 segundos
  - DLQ tiene >0 jobs nuevos hoy

INFORMATIVO (revisar semanalmente):
  - Total de jobs procesados en la semana
  - Distribución por tipo (contact/deal/company)
  - Errores más frecuentes por código
```

### 18.3 Implementación de alertas en fase 1

```
Con Railway como plataforma:

1. Logs en Railway dashboard:
   Railway captura stdout/stderr automáticamente.
   Los logs JSON estructurados son filtrables en el log viewer.
   → Accesible desde: Railway dashboard → Service → Deployments → View Logs

2. Health check en deploy:
   Railway verifica /health antes de rutear tráfico (zero-downtime deploy).
   → Si /health retorna 503, Railway no promueve el nuevo deploy.

3. Monitoreo continuo:
   Railway NO monitorea /health después del deploy.
   Opciones:
   a) Uptime Kuma (template en Railway marketplace — servicio adicional)
   b) Cron externo: curl -s https://<service>.railway.app/health | jq '.status'
   c) HubSpot workflow que alerte si id_oracle deja de actualizarse

4. DLQ monitoring:
   GET /health incluye dlqSize en la respuesta.
   GET /admin/dlq (endpoint) lista jobs fallidos desde PostgreSQL.
   → Usar cron o Uptime Kuma para alertar si dlqSize > umbral

5. Si el proceso muere:
   Railway auto-restart nativo — no necesita pm2 ni systemd.

Fase 2 (cuando crezca):
  - Enviar logs JSON a Betterstack, Axiom, o Datadog vía Railway log drain
  - Dashboard con métricas en tiempo real
  - Alertas automáticas por condiciones predefinidas
```

---

## 19. Versionado Oracle API

### 19.1 Headers requeridos por Oracle OHIP

Basado en las specs del proyecto (ApiOracleCRM.json, ApiOracleReservations.json,
ApiOracleIntegrationProcessor.json). Todos los endpoints requieren estos headers:

```
Headers obligatorios:
  authorization:           "Bearer {token}"
  x-app-key:               UUID v4 (ORACLE_APP_KEY del .env)
  x-hotelid:               string (ORACLE_HOTEL_ID del .env)

Headers opcionales pero recomendados:
  x-externalsystem:        string max 40 chars (ORACLE_EXTERNAL_SYSTEM, default "CLOSAP_HS")
  x-request-id:            UUID v4 (generar uno nuevo por request — trazabilidad)
  x-originating-application: string (identificador de nuestro bridge)
  Accept-Language:          "es" (para mensajes de error en español)
  externalData:             "true" si el payload necesita Data Value Mapping (DVM)

Content-Type:              "application/json;charset=UTF-8" (para POST/PUT)
```

### 19.2 Versión actual y migración

```
Versión actual en las specs del proyecto: 26.1.0.0
  → "Compatible with OPERA Cloud release 26.1.0.0"

La versión va en la URL base, no en un header:
  Base URL: https://{host}/crm/v1/         (CRM — perfiles)
            https://{host}/rsv/v1/         (Reservations)
            https://{host}/int/v1/         (Integration Processor — Business Events)
            https://{host}/oauth/v1/       (Authentication)

Cuando Oracle publique v2 de algún módulo:
  1. La URL base cambiará (ej: /crm/v2/)
  2. Los schemas pueden tener campos nuevos o deprecados
  3. Nuestra acción: actualizar ORACLE_BASE_URL en .env y los types en domain/

Mitigación incorporada en el diseño:
  - Los tipos de domain/ solo incluyen campos que usamos, no el schema completo
  - Los mappers son el punto de conversión — si Oracle cambia un campo,
    se actualiza el mapper, no el job ni el domain type
  - x-request-id por request permite trazar exactamente qué llamada falló
    durante una migración de versión
```

### 19.3 Releases de Oracle (referencia)

```
Fuente: https://github.com/oracle/hospitality-api-docs/releases

Cadencia: ~4 releases por año (trimestral)
Versiones recientes: 25.1, 25.4, 25.5
Cada release incluye release notes con breaking changes y deprecated features

Acción recomendada: revisar release notes al menos 1x por trimestre
```

---

## 20. Procedimiento de recovery/rollback manual

### 20.1 Recovery de jobs fallidos (DLQ)

```
Escenario: Un job falló 3 veces y fue enviado a dead letter (PostgreSQL).

Paso 1 — Identificar el problema:
  GET https://<service>.railway.app/admin/dlq
  GET https://<service>.railway.app/admin/dlq?jobType=deal.create&status=pending
  → Retorna lista de jobs fallidos con errorCode, lastError, payload

Paso 2 — Diagnosticar:
  Si ORACLE_400 → revisar o:errorPath, corregir datos en HubSpot
  Si ORACLE_401 → verificar credenciales Oracle, refrescar token manualmente
  Si HUBSPOT_404 → el objeto fue eliminado, marcar como resolved
  Si MAPPER_VALIDATION → campos faltantes en HubSpot, completar y reintentar

Paso 3 — Re-ejecutar manualmente:
  GET https://<service>.railway.app/sync-to-oracle/<hubspot-object-id>
  → El endpoint re-crea el job y lo ejecuta sincrónicamente
  → Responde con el resultado (éxito o error detallado)
  → Si éxito, marca automáticamente el DLQ entry como "resolved"

Paso 4 — Verificar:
  Confirmar en HubSpot que id_oracle y numero_de_reserva fueron escritos
  Confirmar en Oracle que el perfil/reserva existe

Paso 5 — Marcar como resuelto (si se resolvió fuera del bridge):
  POST https://<service>.railway.app/admin/dlq/<jobId>/resolve
  → Actualiza status a "resolved" en PostgreSQL
```

### 20.2 Recovery de estado inconsistente

```
Escenario: El bridge creó la reserva en Oracle pero falló al guardar
el id_oracle en HubSpot (ej: HubSpot estaba caído en ese momento).

Diagnóstico:
  Buscar en logs: "Job:Deal" + dealId + "ID Oracle"
  → El log del paso 5 tendrá el internalId de Oracle

Recovery:
  1. Obtener el Oracle Reservation ID de los logs
  2. Actualizar manualmente en HubSpot:
     PUT /crm/v3/objects/deals/{dealId}
     { "properties": { "id_oracle": "<oracleId>" } }
  3. O usar el endpoint de sync: GET /sync-to-oracle/{dealId}
     → Detectará que Oracle ya tiene la reserva (existingOracleId)
     → Ejecutará update en vez de create
```

### 20.3 Rollback de una reserva incorrecta

```
Escenario: Se creó una reserva en Oracle con datos incorrectos.

NO hay eliminación de reservas en Oracle. Solo cancelación:
  POST /hotels/{hotelId}/reservations/{reservationId}/cancellations
  operationId: postCancelReservation

Pasos:
  1. Obtener el Oracle Reservation ID del Deal en HubSpot (campo id_oracle)
  2. El job deal.cancel.ts ejecuta la cancelación
  3. O manual: DELETE /sync-to-oracle/{dealId} (si implementamos)
  4. El código de cancelación viene de ORACLE_CANCELLATION_REASON_CODE (.env)
  5. Crear nueva reserva con datos correctos desde HubSpot
```

### 20.4 Recovery del servidor (crash/restart)

```
Con PostgreSQL como cola, el impacto de un crash o redeploy es mínimo:

Cola persistente: Los jobs en status 'pending' sobreviven el restart.
Al reiniciar, el worker retoma automáticamente donde quedó.

Jobs in-flight: Si un job estaba en status 'processing' al momento
del crash, el worker al arrancar detecta jobs con status='processing'
que llevan más de 60 segundos estancados → los resetea a 'pending'
para reprocesamiento.

DLQ persistente: Los jobs en dead_letter_jobs nunca se pierden.

Lo único que se pierde en un restart:
  - Dedup map en memoria (TTL 10s) → se reconstruye con nuevos webhooks
  - Oracle OAuth token → se reobtiene al arranque
  - Ambos son efímeros por diseño y no requieren persistencia

Mitigación en Railway:
  - Railway auto-restart nativo si el proceso muere
  - Zero-downtime deploy: verifica /health antes de rutear tráfico
  - PostgreSQL addon: persiste independientemente del bridge
  - HubSpot retry policy: reenvía webhooks no confirmados (red de seguridad extra)
```

---

## 21. Persistencia (PostgreSQL + Drizzle ORM)

### 21.1 Mapa de persistencia en Railway

```
Componentes en PostgreSQL (persisten siempre):
  - Tabla jobs              → Cola de trabajo persistente
  - Tabla dead_letter_jobs  → DLQ con estados (pending/resolved/ignored)
  - Tabla sync_logs         → Historial de sincronizaciones queryable

Componentes en memoria (se pierden en redeploy):
  - Dedup map (TTL 10s)     → OK: se reconstruye con nuevos webhooks
  - Oracle OAuth token      → OK: se reobtiene al arranque

Componentes en Railway Variables (persisten siempre):
  - Todas las variables de .env se configuran en Railway dashboard
  - Railway inyecta PORT, RAILWAY_PUBLIC_DOMAIN y DATABASE_URL automáticamente

Componentes en Railway Logs (persisten por retención de Railway):
  - Todos los console.log/error del proceso (además de sync_logs en PG)
```

### 21.2 Drizzle schema (shared/db/schema.ts)

```
Tabla: jobs (cola de trabajo persistente)

  id              TEXT PRIMARY KEY          -- UUID generado al enqueue
  type            TEXT NOT NULL             -- 'contact.create', 'deal.update', etc.
  object_id       TEXT NOT NULL             -- HubSpot object ID
  status          TEXT DEFAULT 'pending'    -- 'pending'|'processing'|'completed'|'failed'
  attempts        INTEGER DEFAULT 0
  max_attempts    INTEGER DEFAULT 3
  last_error      TEXT
  next_retry_at   TIMESTAMPTZ              -- null=disponible, futuro=esperando backoff
  created_at      TIMESTAMPTZ DEFAULT now()
  updated_at      TIMESTAMPTZ DEFAULT now()

  Índices: (status, next_retry_at), object_id
  Constraint: UNIQUE (object_id, type) WHERE status = 'pending'  -- dedup


Tabla: dead_letter_jobs (jobs que agotaron reintentos)

  id              TEXT PRIMARY KEY          -- UUID del job original
  job_type        TEXT NOT NULL
  object_id       TEXT NOT NULL
  payload         JSONB NOT NULL            -- Job completo, queryable con operadores JSONB
  error_code      TEXT NOT NULL             -- 'ORACLE_400', 'HUBSPOT_429', etc.
  first_error     TEXT NOT NULL
  last_error      TEXT NOT NULL
  attempts        INTEGER NOT NULL
  status          TEXT DEFAULT 'pending'    -- 'pending'|'resolved'|'ignored'
  created_at      TIMESTAMPTZ NOT NULL
  failed_at       TIMESTAMPTZ NOT NULL
  resolved_at     TIMESTAMPTZ              -- null si pending
  resolved_by     TEXT                      -- 'manual'|'sync-endpoint'|null

  Índices: status, job_type, object_id, created_at


Tabla: sync_logs (historial de sincronizaciones)

  id              SERIAL PRIMARY KEY
  job_id          TEXT                      -- Referencia al job (no FK, puede ser null)
  job_type        TEXT NOT NULL             -- 'contact.create', 'deal.update', etc.
  object_id       TEXT NOT NULL             -- HubSpot object ID
  oracle_id       TEXT                      -- Oracle Profile/Reservation ID (si aplica)
  direction       TEXT NOT NULL             -- 'hubspot-to-oracle'|'oracle-to-hubspot'
  status          TEXT NOT NULL             -- 'success'|'error'|'retry'
  error_code      TEXT                      -- null si success
  error_message   TEXT                      -- null si success
  duration_ms     INTEGER                   -- Tiempo de procesamiento
  metadata        JSONB                     -- Datos extra (campos actualizados, etc.)
  created_at      TIMESTAMPTZ DEFAULT now()

  Índices: object_id, job_type, status, created_at
```

### 21.3 Queries útiles habilitadas por PostgreSQL

```
-- Jobs fallidos por tipo en la última semana
SELECT job_type, COUNT(*) FROM dead_letter_jobs
WHERE created_at > now() - interval '7 days' GROUP BY job_type;

-- Errores Oracle más frecuentes
SELECT error_code, COUNT(*) FROM sync_logs
WHERE status = 'error' AND error_code LIKE 'ORACLE_%'
GROUP BY error_code ORDER BY count DESC;

-- Latencia promedio por tipo de job
SELECT job_type, AVG(duration_ms) as avg_ms FROM sync_logs
WHERE status = 'success' GROUP BY job_type;

-- Historial completo de un Deal específico
SELECT * FROM sync_logs WHERE object_id = '12345' ORDER BY created_at;

-- Jobs en cola pendientes con tiempo de espera
SELECT id, type, object_id, attempts,
       EXTRACT(EPOCH FROM now() - created_at) as wait_seconds
FROM jobs WHERE status = 'pending' ORDER BY created_at;

-- Tasa de éxito por día
SELECT DATE(created_at) as day,
       COUNT(*) FILTER (WHERE status='success') as ok,
       COUNT(*) FILTER (WHERE status='error') as errors
FROM sync_logs GROUP BY day ORDER BY day DESC LIMIT 7;
```

### 21.4 Repositories (interfaces en domain/ports/)

```
interface IQueueRepository {
  enqueue(job: NewJob): Promise<Result<Job, AppError>>
  dequeue(): Promise<Result<Job | null, AppError>>
  complete(jobId: string): Promise<Result<void, AppError>>
  fail(jobId: string, error: string, errorCode: string): Promise<Result<void, AppError>>
  size(): Promise<number>
}

interface IDlqRepository {
  insert(entry: NewDlqEntry): Promise<Result<void, AppError>>
  findPending(): Promise<DlqEntry[]>
  findByObjectId(objectId: string): Promise<DlqEntry[]>
  findByJobType(jobType: JobType): Promise<DlqEntry[]>
  markResolved(jobId: string, resolvedBy: string): Promise<Result<void, AppError>>
  markIgnored(jobId: string): Promise<Result<void, AppError>>
  countPending(): Promise<number>
  getStats(): Promise<{ pending: number; resolved: number; ignored: number }>
}

interface ISyncLogRepository {
  log(entry: NewSyncLog): Promise<void>
  findByObjectId(objectId: string): Promise<SyncLog[]>
  getErrorStats(since: Date): Promise<{ errorCode: string; count: number }[]>
  getAvgLatency(jobType: JobType): Promise<number>
}
```

### 21.5 Endpoints de administración

```
GET  /admin/dlq                    → Lista jobs pendientes (status=pending)
GET  /admin/dlq?status=resolved    → Lista jobs resueltos
GET  /admin/dlq?jobType=deal.create→ Filtra por tipo
GET  /admin/dlq/stats              → { pending, resolved, ignored }
POST /admin/dlq/:jobId/resolve     → Marca como resuelto manualmente
POST /admin/dlq/:jobId/ignore      → Marca como ignorado
POST /admin/dlq/:jobId/retry       → Re-encola el job para reintento

GET  /admin/queue                  → Jobs en cola (pending + processing)
GET  /admin/logs?objectId=12345    → Historial de sync de un objeto
GET  /admin/logs/stats             → Errores por código, latencia promedio

Nota: estos endpoints NO requieren autenticación en fase 1.
El dominio .railway.app es público pero los endpoints /admin/ son
de bajo riesgo (lectura + marcado). Si se necesita protección:
agregar un header secret (ADMIN_SECRET en Railway Variables) en fase 2.
```

### 21.6 Migraciones con drizzle-kit

```
Archivos:
  drizzle.config.ts          → Configuración de drizzle-kit
  drizzle/                   → Carpeta con migraciones SQL generadas

Workflow:
  1. Modificar shared/db/schema.ts (agregar columna, tabla, etc.)
  2. npx drizzle-kit generate  → genera SQL de migración en drizzle/
  3. Revisar el SQL generado antes de aplicar
  4. npx drizzle-kit migrate   → aplica migración (o al arranque del server)

En Railway:
  La migración se ejecuta al arranque del server (shared/db/migrate.ts)
  antes de iniciar Express. Si falla → el server no arranca → /health
  no responde → Railway no rutea tráfico (rollback automático).

En desarrollo local:
  DATABASE_URL=postgresql://user:pass@localhost:5432/puente_dev
  npx drizzle-kit push  → aplica schema directamente (sin migración)
```

---

## 22. Railway — Configuración de deploy

### 22.1 Estructura del proyecto en Railway

```
Railway Project: puente-clos-apalta
├── Service: bridge (Node.js)
│   ├── Source: GitHub repo (auto-deploy desde main)
│   ├── Domain: {auto-generated}.railway.app
│   └── Variables: configuradas en Railway dashboard
└── Service: PostgreSQL (addon)
    ├── DATABASE_URL: auto-inyectada como variable referenciada
    └── Backups: automáticos (Railway managed)
```

### 22.2 Variables de entorno en Railway

```
Configurar en Railway dashboard → Service bridge → Variables:

# Oracle OHIP
ORACLE_BASE_URL=https://{host}
ORACLE_CLIENT_ID=<valor>
ORACLE_CLIENT_SECRET=<valor>
ORACLE_HOTEL_ID=<valor>
ORACLE_APP_KEY=<uuid>
ORACLE_EXTERNAL_SYSTEM=CLOSAP_HS
ORACLE_CANCELLATION_REASON_CODE=CANCEL

# HubSpot
HUBSPOT_ACCESS_TOKEN=<valor>
HUBSPOT_CLIENT_SECRET=<valor>

# App
NODE_ENV=production

# PostgreSQL (referenciar desde el addon):
DATABASE_URL=${{Postgres.DATABASE_URL}}

# Inyectadas automáticamente por Railway (NO configurar manualmente):
# PORT                    → Railway asigna dinámicamente
# RAILWAY_PUBLIC_DOMAIN   → Dominio .railway.app generado
# RAILWAY_ENVIRONMENT     → production
```

### 22.3 Build y start

```
Railway detecta Node.js automáticamente vía package.json.

Build: npm run build → tsc (compila TypeScript a dist/)
Start: npm start → node dist/index.js

Flujo de arranque (index.ts):
  1. Validar config con zod (incluyendo DATABASE_URL)
  2. Conectar a PostgreSQL + ejecutar migraciones (shared/db/migrate.ts)
  3. Crear container (clients + repositories)
  4. Iniciar Express + worker
  5. Escuchar en PORT

Scripts en package.json:
  "build": "tsc"
  "start": "node dist/index.js"
  "dev": "tsx watch src/index.ts"
  "test": "vitest run"
  "db:generate": "drizzle-kit generate"
  "db:migrate": "drizzle-kit migrate"
  "db:push": "drizzle-kit push"
  "db:studio": "drizzle-kit studio"

Nota sobre PORT:
  Railway inyecta PORT como string. El schema zod usa z.coerce.number()
  para convertirlo. Express debe escuchar en "::" (IPv6) o "0.0.0.0":
    app.listen(Number(config.PORT), "::")
```

### 22.4 Health check

```
Configurar en Railway dashboard → Service → Settings → Health Check:
  Path: /health
  Timeout: 30 seconds (default)

Railway verifica /health una sola vez al deploy, antes de rutear tráfico.
El request viene desde hostname: healthcheck.railway.app
→ No bloquear este hostname en middleware.

/health ahora incluye check de PostgreSQL:
  checks.database: { status: "ok"|"error", latencyMs }
  → Ejecuta SELECT 1 para verificar conexión

Si /health retorna 503 → Railway no promueve el deploy (rollback automático).
Esto protege contra: migraciones fallidas, DATABASE_URL inválida, PG caído.
```

### 22.5 PostgreSQL addon

```
Configurar en Railway dashboard:
  Project → New → Database → PostgreSQL

Railway automáticamente:
  - Provisiona una instancia PostgreSQL
  - Genera DATABASE_URL con host, port, user, password, dbname
  - La hace disponible como variable referenciable: ${{Postgres.DATABASE_URL}}

Conexión desde el bridge:
  - Usar DATABASE_URL directamente con postgres.js (driver de Drizzle)
  - Railway conecta internamente vía private networking (sin TLS extra)
  - En producción: pool de conexiones implícito en postgres.js

En desarrollo local:
  - Instalar PostgreSQL localmente o usar Docker:
    docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=dev postgres:16
  - DATABASE_URL=postgresql://postgres:dev@localhost:5432/puente_dev
  - npx drizzle-kit push → aplica schema directamente
```

### 22.6 Deploy workflow

```
Flujo de deploy:

1. Developer hace push a main en GitHub
2. Railway detecta el push automáticamente
3. Railway ejecuta npm install → npm run build (tsc)
4. Railway inicia el nuevo proceso con npm start
5. El proceso ejecuta migraciones de Drizzle al arranque
6. El proceso inicia Express y responde en PORT
7. Railway envía GET /health al nuevo proceso
8. Si 200 → rutea tráfico al nuevo proceso (zero-downtime)
9. Si 503 o timeout → rollback al deploy anterior

Logs: Railway dashboard → Service → Deployments → View Logs
Variables: Railway dashboard → Service → Variables
Dominio: Railway dashboard → Service → Settings → Networking → Public Domain
DB: Railway dashboard → PostgreSQL service → Data → Query tab

Webhook URL para HubSpot:
  https://{service}.railway.app/webhook/hubspot
```

### 22.7 .env.example (referencia para Railway Variables)

```
# ── App ──
NODE_ENV=development
PORT=3000

# ── Oracle OHIP ──
ORACLE_BASE_URL=https://your-oracle-host.com
ORACLE_CLIENT_ID=your-client-id
ORACLE_CLIENT_SECRET=your-client-secret
ORACLE_HOTEL_ID=HOTEL1
ORACLE_APP_KEY=00000000-0000-4000-8000-000000000000
ORACLE_EXTERNAL_SYSTEM=CLOSAP_HS
ORACLE_CANCELLATION_REASON_CODE=CANCEL

# ── HubSpot ──
HUBSPOT_ACCESS_TOKEN=pat-xx-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
HUBSPOT_CLIENT_SECRET=your-client-secret

# ── PostgreSQL ──
DATABASE_URL=postgresql://postgres:dev@localhost:5432/puente_dev
```
