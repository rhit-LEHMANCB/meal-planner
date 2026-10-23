import { defineConfig } from 'drizzle-kit';

try {
	process.loadEnvFile('.env');
} catch {
	// No .env file: rely on the real environment (CI).
}

// Migrations use the direct (unpooled) connection. The app itself uses the pooled DATABASE_URL.
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL_UNPOOLED or DATABASE_URL is not set');

export default defineConfig({
	schema: './src/lib/server/db/schema.ts',
	dialect: 'postgresql',
	dbCredentials: { url },
	verbose: true,
	strict: true
});
