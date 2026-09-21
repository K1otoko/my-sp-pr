import { Router, json } from 'express';
import { healthEndpoint, serviceContract, fullPath, expressPath } from '../api/index.js';
import { getHealth } from '../controllers/health.controller.js';

export const healthRouter = Router();
healthRouter[healthEndpoint.method](
  expressPath(fullPath(serviceContract, healthEndpoint)),
  json({ limit: '100kb' }),
  getHealth,
);
