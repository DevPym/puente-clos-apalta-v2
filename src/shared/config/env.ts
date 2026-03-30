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
  ORACLE_ENTERPRISE_ID: z.string().default('CLOSAP'),
  ORACLE_SCOPE: z.string().default('urn:opc:hgbu:ws:__myscopes__'),
  ORACLE_DEFAULT_MARKET_CODE: z.string().default('DIRECT'),
  ORACLE_EXTERNAL_SYSTEM: z.string().default('CLOSAP_HS'),
  ORACLE_CANCELLATION_REASON_CODE: z.string().default('CANCEL'),

  // HubSpot
  HUBSPOT_ACCESS_TOKEN: z.string().min(1),
  HUBSPOT_CLIENT_SECRET: z.string().min(1),

  // Railway
  RAILWAY_PUBLIC_DOMAIN: z.string().optional(),

  // PostgreSQL
  DATABASE_URL: z.string().url(),
});

export type AppConfig = z.infer<typeof envSchema>;

export function parseEnv(env: Record<string, string | undefined> = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);

  if (!parsed.success) {
    console.error('❌ Invalid configuration:');
    console.error(parsed.error.flatten().fieldErrors);
    process.exit(1);
  }

  return parsed.data;
}

export const config = parseEnv();
