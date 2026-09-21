import type { RequestHandler } from 'express';
import { healthEndpoint, type HealthResponse } from '../api/index.js';
import { getHealthData } from '../services/health.service.js';

export const getHealth: RequestHandler = (_request, response) => {
  const payload: HealthResponse = { success: true, data: getHealthData() };
  const schema = healthEndpoint.responses[200].content['application/json'].schema;
  response.json(schema.parse(payload));
};
