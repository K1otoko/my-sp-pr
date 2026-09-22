import { createDatabase } from '@my-sp-pr/database';
import { env } from '../config/env.js';
import * as schema from './schema/index.js';

export const database = createDatabase({ config: env.database, schema, namespace: 'admin' });
export const db = database.db;
