import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

/**
 * Middleware de verificación HMAC-SHA256 para webhooks de HubSpot (signature v3).
 *
 * Firma v3: HMAC-SHA256( requestMethod + requestUri + requestBody + timestamp )
 * donde requestUri es la URL completa que HubSpot envió (siempre https).
 *
 * Detrás de un proxy (Railway, Heroku, etc.) req.protocol puede ser "http"
 * aunque HubSpot firmó con "https://". Se usa x-forwarded-proto para resolverlo.
 */
export function createWebhookVerifyMiddleware(clientSecret: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const signature = req.headers['x-hubspot-signature-v3'] as string | undefined;
    const timestamp = req.headers['x-hubspot-request-timestamp'] as string | undefined;

    if (!signature || !timestamp) {
      res.status(401).json({ error: 'Missing HubSpot signature headers' });
      return;
    }

    // Reject if timestamp > 5 minutes old (replay protection)
    const timestampMs = Number(timestamp);
    if (Number.isNaN(timestampMs) || Date.now() - timestampMs > 5 * 60 * 1000) {
      res.status(401).json({ error: 'Request timestamp expired' });
      return;
    }

    // HubSpot v3: HMAC-SHA256 of requestMethod + requestUri + requestBody + timestamp
    const rawBody = (req as Request & { rawBody?: string }).rawBody ?? JSON.stringify(req.body);

    // Detrás de proxy (Railway), req.protocol puede ser "http".
    // Usar x-forwarded-proto si existe, sino req.protocol. HubSpot siempre firma con https.
    const proto = (req.headers['x-forwarded-proto'] as string)?.split(',')[0]?.trim() || req.protocol;
    const host = req.get('host') ?? 'localhost';
    const requestUri = `${proto}://${host}${req.originalUrl}`;

    const sourceString = `${req.method}${requestUri}${rawBody}${timestamp}`;

    const expectedSignature = createHmac('sha256', clientSecret)
      .update(sourceString)
      .digest('base64');

    // Comparación segura contra timing attacks
    try {
      const sigBuf = Buffer.from(signature, 'base64');
      const expectedBuf = Buffer.from(expectedSignature, 'base64');
      if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
        res.status(401).json({ error: 'Invalid HubSpot signature' });
        return;
      }
    } catch {
      res.status(401).json({ error: 'Invalid HubSpot signature' });
      return;
    }

    next();
  };
}
