import type { RequestHandler } from 'express';
import { readinessEndpoint, type ReadinessResponse } from '../api/index.js';
import { getReadinessData } from '../services/readiness.service.js';

export const getReadiness: RequestHandler = async (_request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  const payload: ReadinessResponse = { success: true, data: await getReadinessData() };
  const schema = readinessEndpoint.responses[200].content['application/json'].schema;
  response.json(schema.parse(payload));
};
