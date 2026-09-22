import { Router } from 'express';
import { healthRouter } from './health.routes.js';
import { readinessRouter } from './readiness.routes.js';

export const router = Router();
router.use(healthRouter);
router.use(readinessRouter);
