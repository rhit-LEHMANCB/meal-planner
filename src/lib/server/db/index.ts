import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from './schema';
import { env } from '$env/dynamic/private';

let instance: ReturnType<typeof create> | undefined;

const create = () => {
	// Use the pooled connection string: each Cloud Run instance would otherwise open its own connection.
	if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
	return drizzle(neon(env.DATABASE_URL), { schema });
};

// Secrets are read at runtime (Secret Manager on App Hosting), so build the client on first use.
export const getDb = () => (instance ??= create());
