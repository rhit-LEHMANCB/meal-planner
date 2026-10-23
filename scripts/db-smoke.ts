// Proves the Neon connection end to end: writes a row, reads it back, deletes it.
// Run with `npm run db:smoke`.
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq } from 'drizzle-orm';
import { foods } from '../src/lib/server/db/schema';

try {
	process.loadEnvFile('.env');
} catch {
	// Rely on the real environment.
}
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const db = drizzle(neon(url));
const name = `db-smoke-${Date.now()}`;

const [inserted] = await db
	.insert(foods)
	.values({
		name,
		userId: 'db-smoke',
		kcalPer100g: '100',
		proteinPer100g: '10',
		carbsPer100g: '10',
		fatPer100g: '1'
	})
	.returning();

const [found] = await db.select().from(foods).where(eq(foods.id, inserted.id));
if (found?.name !== name) throw new Error('Row written but not read back');

await db.delete(foods).where(eq(foods.id, inserted.id));
const remaining = await db.select().from(foods).where(eq(foods.id, inserted.id));
if (remaining.length !== 0) throw new Error('Row was not deleted');

console.log(`db smoke OK: inserted, read back and deleted ${name}`);
