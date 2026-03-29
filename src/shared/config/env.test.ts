import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// Re-declare the schema here to test parsing without triggering process.exit
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  ORACLE_BASE_URL: z.string().url(),
  ORACLE_CLIENT_ID: z.string().min(1),
  ORACLE_CLIENT_SECRET: z.string().min(1),
  ORACLE_HOTEL_ID: z.string().min(1),
  ORACLE_APP_KEY: z.string().uuid(),
  ORACLE_EXTERNAL_SYSTEM: z.string().default('CLOSAP_HS'),
  ORACLE_CANCELLATION_REASON_CODE: z.string().default('CANCEL'),
  HUBSPOT_ACCESS_TOKEN: z.string().min(1),
  HUBSPOT_CLIENT_SECRET: z.string().min(1),
  RAILWAY_PUBLIC_DOMAIN: z.string().optional(),
  DATABASE_URL: z.string().url(),
});

const validEnv = {
  NODE_ENV: 'production',
  PORT: '8080',
  ORACLE_BASE_URL: 'https://oracle.example.com',
  ORACLE_CLIENT_ID: 'client-id',
  ORACLE_CLIENT_SECRET: 'client-secret',
  ORACLE_HOTEL_ID: 'CAR',
  ORACLE_APP_KEY: '00000000-0000-4000-8000-000000000000',
  HUBSPOT_ACCESS_TOKEN: 'pat-xx-token',
  HUBSPOT_CLIENT_SECRET: 'hs-secret',
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/puente_dev',
};

describe('envSchema', () => {
  it('accepts valid configuration', () => {
    const result = envSchema.safeParse(validEnv);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.PORT).toBe(8080);
      expect(result.data.NODE_ENV).toBe('production');
      expect(result.data.ORACLE_HOTEL_ID).toBe('CAR');
    }
  });

  it('applies defaults for optional fields', () => {
    const result = envSchema.safeParse(validEnv);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ORACLE_EXTERNAL_SYSTEM).toBe('CLOSAP_HS');
      expect(result.data.ORACLE_CANCELLATION_REASON_CODE).toBe('CANCEL');
    }
  });

  it('coerces PORT string to number', () => {
    const result = envSchema.safeParse({ ...validEnv, PORT: '3000' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.PORT).toBe(3000);
      expect(typeof result.data.PORT).toBe('number');
    }
  });

  it('defaults PORT to 3000 when missing', () => {
    const { PORT: _, ...envWithoutPort } = validEnv;
    const result = envSchema.safeParse(envWithoutPort);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.PORT).toBe(3000);
    }
  });

  it('rejects missing ORACLE_BASE_URL', () => {
    const { ORACLE_BASE_URL: _, ...env } = validEnv;
    const result = envSchema.safeParse(env);
    expect(result.success).toBe(false);
  });

  it('rejects invalid ORACLE_BASE_URL (not a URL)', () => {
    const result = envSchema.safeParse({ ...validEnv, ORACLE_BASE_URL: 'not-a-url' });
    expect(result.success).toBe(false);
  });

  it('rejects missing HUBSPOT_ACCESS_TOKEN', () => {
    const { HUBSPOT_ACCESS_TOKEN: _, ...env } = validEnv;
    const result = envSchema.safeParse(env);
    expect(result.success).toBe(false);
  });

  it('rejects empty ORACLE_CLIENT_ID', () => {
    const result = envSchema.safeParse({ ...validEnv, ORACLE_CLIENT_ID: '' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid ORACLE_APP_KEY (not UUID)', () => {
    const result = envSchema.safeParse({ ...validEnv, ORACLE_APP_KEY: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid NODE_ENV', () => {
    const result = envSchema.safeParse({ ...validEnv, NODE_ENV: 'staging' });
    expect(result.success).toBe(false);
  });

  it('rejects missing DATABASE_URL', () => {
    const { DATABASE_URL: _, ...env } = validEnv;
    const result = envSchema.safeParse(env);
    expect(result.success).toBe(false);
  });

  it('rejects invalid DATABASE_URL (not a URL)', () => {
    const result = envSchema.safeParse({ ...validEnv, DATABASE_URL: 'not-a-url' });
    expect(result.success).toBe(false);
  });

  it('allows RAILWAY_PUBLIC_DOMAIN to be absent', () => {
    const result = envSchema.safeParse(validEnv);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.RAILWAY_PUBLIC_DOMAIN).toBeUndefined();
    }
  });
});
