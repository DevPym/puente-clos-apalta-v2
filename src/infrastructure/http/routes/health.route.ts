import { Router } from 'express';

const router = Router();

const startTime = Date.now();

router.get('/health', (_req, res) => {
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);

  res.status(200).json({
    status: 'healthy',
    uptime: uptimeSeconds,
    timestamp: new Date().toISOString(),
  });
});

export { router as healthRouter };
