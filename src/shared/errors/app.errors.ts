export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class OracleApiError extends AppError {
  constructor(
    message: string,
    oracleErrorCode: string,
    statusCode: number,
    context?: Record<string, unknown>,
  ) {
    super(message, `ORACLE_${oracleErrorCode}`, statusCode, context);
  }
}

export class HubSpotApiError extends AppError {
  constructor(
    message: string,
    hsErrorCategory: string,
    statusCode: number,
    context?: Record<string, unknown>,
  ) {
    super(message, `HUBSPOT_${hsErrorCategory}`, statusCode, context);
  }
}

export class ConfigError extends AppError {
  constructor(message: string) {
    super(message, 'CONFIG_INVALID', 500);
  }
}
