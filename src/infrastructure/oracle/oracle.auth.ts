import axios from 'axios';
import type { ILogger } from '../../shared/logger/logger.js';

export interface OracleAuthConfig {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
}

interface TokenData {
  accessToken: string;
  expiresAt: number; // epoch ms
}

export class OracleAuth {
  private token: TokenData | null = null;
  private refreshPromise: Promise<string> | null = null;

  constructor(
    private readonly config: OracleAuthConfig,
    private readonly logger: ILogger,
  ) {}

  async getToken(): Promise<string> {
    if (this.token && Date.now() < this.token.expiresAt - 60_000) {
      return this.token.accessToken;
    }

    // Prevent concurrent refresh calls
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.refreshToken();
    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  async refreshToken(): Promise<string> {
    this.logger.info('Refreshing Oracle OAuth token');

    const response = await axios.post<{
      access_token: string;
      expires_in: number;
      token_type: string;
    }>(
      `${this.config.baseUrl}/oauth/v1/tokens`,
      new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
      }).toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 10_000,
      },
    );

    const { access_token, expires_in } = response.data;

    this.token = {
      accessToken: access_token,
      expiresAt: Date.now() + expires_in * 1000,
    };

    this.logger.info('Oracle OAuth token refreshed', { expiresIn: expires_in });

    return access_token;
  }

  invalidateToken(): void {
    this.token = null;
  }
}
