import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from './schema';
import { DATABASE_URL } from '$app/env/private';

// Use the pooled connection string: each Cloud Function instance would otherwise open its own connection.
const client = neon(DATABASE_URL);

export const db = drizzle(client, { schema });
