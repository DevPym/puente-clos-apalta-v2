import { createHmac } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

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
    const sourceString = `${req.method}${req.protocol}://${req.get('host')}${req.originalUrl}${rawBody}${timestamp}`;

    const expectedSignature = createHmac('sha256', clientSecret)
      .update(sourceString)
      .digest('base64');

    if (signature !== expectedSignature) {
      res.status(401).json({ error: 'Invalid HubSpot signature' });
      return;
    }

    next();
  };
}
