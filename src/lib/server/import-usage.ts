import { and, eq, lt, sql } from 'drizzle-orm';
import { getDb, type Db } from './db';
import { importUsage } from './db/schema';

/** AI-parsed imports allowed per user per UTC day. Structured-data imports are free. */
export const DAILY_AI_IMPORTS = 20;

/** Minimum time between two imports by the same user, of any source. */
export const COOLDOWN_SECONDS = 10;

// Computed in SQL so the app server's clock and time zone never matter.
const today = sql`(now() at time zone 'utc')::date`;

/**
 * Per-user import limits, kept in Postgres so they survive restarts and hold across instances.
 * Each check is one statement, so parallel requests cannot get past either limit.
 */
export const makeImportUsage = (db: Db) => ({
	/**
	 * Starts an import if the user's last one was at least COOLDOWN_SECONDS ago, and moves their
	 * counter to today. False means "too soon": nothing was started.
	 */
	async startImport(userId: string): Promise<boolean> {
		const rows = await db
			.insert(importUsage)
			.values({ userId, day: sql`${today}`, aiCount: 0, lastImportAt: sql`now()` })
			.onConflictDoUpdate({
				target: importUsage.userId,
				set: {
					lastImportAt: sql`now()`,
					day: sql`${today}`,
					aiCount: sql`case when ${importUsage.day} = ${today} then ${importUsage.aiCount} else 0 end`
				},
				setWhere: lt(
					importUsage.lastImportAt,
					sql`now() - make_interval(secs => ${COOLDOWN_SECONDS})`
				)
			})
			.returning({ aiCount: importUsage.aiCount });
		return rows.length > 0;
	},

	/** Takes one of today's AI imports. False when the daily limit is reached. Call after startImport. */
	async reserveAi(userId: string): Promise<boolean> {
		const rows = await db
			.update(importUsage)
			.set({ aiCount: sql`${importUsage.aiCount} + 1` })
			.where(
				and(
					eq(importUsage.userId, userId),
					eq(importUsage.day, today),
					lt(importUsage.aiCount, DAILY_AI_IMPORTS)
				)
			)
			.returning({ aiCount: importUsage.aiCount });
		return rows.length > 0;
	},

	/** Gives back a reserved AI import whose request never reached the model. */
	async refundAi(userId: string): Promise<void> {
		await db
			.update(importUsage)
			.set({ aiCount: sql`greatest(${importUsage.aiCount} - 1, 0)` })
			.where(and(eq(importUsage.userId, userId), eq(importUsage.day, today)));
	},

	/** AI imports the user has left today. */
	async remainingToday(userId: string): Promise<number> {
		const [row] = await db
			.select({ aiCount: importUsage.aiCount })
			.from(importUsage)
			.where(and(eq(importUsage.userId, userId), eq(importUsage.day, today)))
			.limit(1);
		return Math.max(DAILY_AI_IMPORTS - (row?.aiCount ?? 0), 0);
	}
});

export type ImportUsage = ReturnType<typeof makeImportUsage>;

export const getImportUsage = (): ImportUsage => makeImportUsage(getDb());
