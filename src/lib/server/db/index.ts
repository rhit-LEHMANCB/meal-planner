import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from './schema';
import { env } from '$env/dynamic/private';

export const createDb = (url: string) => drizzle(neon(url), { schema });
export type Db = ReturnType<typeof createDb>;

let instance: Db | undefined;

// Secrets are read at runtime (Secret Manager on App Hosting), so build the client on first use.
// Use the pooled connection string: each Cloud Run instance would otherwise open its own connection.
export const getDb = () => {
	if (!instance) {
		if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
		instance = createDb(env.DATABASE_URL);
	}
	return instance;
};
