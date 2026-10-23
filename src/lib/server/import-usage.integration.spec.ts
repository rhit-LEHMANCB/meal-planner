// Runs against a real Postgres: the Neon `dev` branch, through TEST_DATABASE_URL. Never production.
// Skipped when the variable is unset (CI does not set it).
import { afterAll, describe, expect, it } from 'vitest';
import { eq, inArray, sql } from 'drizzle-orm';
import { createDb } from './db';
import { importUsage } from './db/schema';
import { DAILY_AI_IMPORTS, makeImportUsage } from './import-usage';

try {
	process.loadEnvFile('.env');
} catch {
	// No .env file: rely on the real environment.
}

const url = process.env.TEST_DATABASE_URL;
const run = `it-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const users = ['a', 'b', 'c', 'd', 'e'].map((u) => `${run}-${u}`);
const [cooldownUser, capUser, rolloverUser, otherUser, refundUser] = users;

describe.skipIf(!url)('import usage (Neon dev branch)', () => {
	const db = createDb(url ?? '');
	const usage = makeImportUsage(db);

	/** Pretends the user's last import was long ago, so the cooldown does not get in the way. */
	const ageLastImport = (userId: string) =>
		db
			.update(importUsage)
			.set({ lastImportAt: sql`now() - interval '1 hour'` })
			.where(eq(importUsage.userId, userId));

	afterAll(async () => {
		await db.delete(importUsage).where(inArray(importUsage.userId, users));
	});

	it('refuses a second import within the cooldown', async () => {
		expect(await usage.startImport(cooldownUser)).toBe(true);
		expect(await usage.startImport(cooldownUser)).toBe(false);
		await ageLastImport(cooldownUser);
		expect(await usage.startImport(cooldownUser)).toBe(true);
	});

	it('allows exactly the daily number of AI imports, even in parallel', async () => {
		await usage.startImport(capUser);
		const results = await Promise.all(
			Array.from({ length: DAILY_AI_IMPORTS + 5 }, () => usage.reserveAi(capUser))
		);
		expect(results.filter(Boolean)).toHaveLength(DAILY_AI_IMPORTS);
		expect(await usage.remainingToday(capUser)).toBe(0);
	});

	it('starts a new day with a fresh count', async () => {
		await usage.startImport(rolloverUser);
		await usage.reserveAi(rolloverUser);
		await usage.reserveAi(rolloverUser);
		await db
			.update(importUsage)
			.set({ day: sql`((now() at time zone 'utc')::date - 1)` })
			.where(eq(importUsage.userId, rolloverUser));
		await ageLastImport(rolloverUser);

		expect(await usage.remainingToday(rolloverUser)).toBe(DAILY_AI_IMPORTS);
		expect(await usage.startImport(rolloverUser)).toBe(true);
		expect(await usage.remainingToday(rolloverUser)).toBe(DAILY_AI_IMPORTS);
	});

	it('takes a slot from the new day when the import started before midnight', async () => {
		const user = `${run}-midnight`;
		users.push(user);
		await usage.startImport(user);
		// As if startImport ran yesterday at the limit and midnight passed before the reserve.
		await db
			.update(importUsage)
			.set({ day: sql`((now() at time zone 'utc')::date - 1)`, aiCount: DAILY_AI_IMPORTS })
			.where(eq(importUsage.userId, user));
		expect(await usage.reserveAi(user)).toBe(true);
		expect(await usage.remainingToday(user)).toBe(DAILY_AI_IMPORTS - 1);
	});

	it('keeps each user to their own count', async () => {
		expect(await usage.remainingToday(otherUser)).toBe(DAILY_AI_IMPORTS);
		expect(await usage.startImport(otherUser)).toBe(true);
		expect(await usage.reserveAi(otherUser)).toBe(true);
		expect(await usage.remainingToday(otherUser)).toBe(DAILY_AI_IMPORTS - 1);
	});

	it('refunds a reserved import but never below zero', async () => {
		await usage.startImport(refundUser);
		await usage.reserveAi(refundUser);
		await usage.refundAi(refundUser);
		await usage.refundAi(refundUser);
		expect(await usage.remainingToday(refundUser)).toBe(DAILY_AI_IMPORTS);
	});

	it('cannot reserve without starting an import first', async () => {
		expect(await usage.reserveAi(`${run}-never-started`)).toBe(false);
	});
});
