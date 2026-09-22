import { Router } from 'express';
import { readinessEndpoint, serviceContract, fullPath, expressPath } from '../api/index.js';
import { getReadiness } from '../controllers/readiness.controller.js';

export const readinessRouter = Router();
readinessRouter[readinessEndpoint.method](expressPath(fullPath(serviceContract, readinessEndpoint)), getReadiness);
