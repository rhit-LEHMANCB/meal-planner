import { and, asc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import type { NewFoodInput } from '$lib/domain/plan-form';
import { getDb, type Db } from './db';
import { foodUnits, foods } from './db/schema';

export interface FoodOption {
	id: string;
	name: string;
	/** True for the user's own custom food, false for a shared one. */
	own: boolean;
	/** Units the food can be measured in: always 'g' first, then its own units. */
	units: string[];
}

export const SEARCH_LIMIT = 20;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const escapeLike = (term: string) => term.replace(/[\\%_]/g, '\\$&');

/**
 * Foods a user can see: shared foods (`user_id` null) and their own custom foods. Writes only ever
 * create rows owned by the user. Another user's custom food looks exactly like a missing one.
 */
export const makeFoodStore = (db: Db) => {
	const visible = (userId: string) => or(eq(foods.userId, userId), isNull(foods.userId));

	const withUnits = async (rows: { id: string; name: string; userId: string | null }[]) => {
		const ids = rows.map((r) => r.id);
		const units = ids.length
			? await db
					.select({ foodId: foodUnits.foodId, unit: foodUnits.unit })
					.from(foodUnits)
					.where(inArray(foodUnits.foodId, ids))
					.orderBy(asc(foodUnits.unit))
			: [];
		return rows.map((r): FoodOption => ({
			id: r.id,
			name: r.name,
			own: r.userId !== null,
			units: ['g', ...units.filter((u) => u.foodId === r.id && u.unit !== 'g').map((u) => u.unit)]
		}));
	};

	return {
		/** Own and shared foods whose name contains `query`, own first, at most 20. */
		async search(userId: string, query: string): Promise<FoodOption[]> {
			const term = query.trim();
			if (!term) return [];
			const rows = await db
				.select({ id: foods.id, name: foods.name, userId: foods.userId })
				.from(foods)
				.where(and(visible(userId), ilike(foods.name, `%${escapeLike(term)}%`)))
				.orderBy(sql`${foods.userId} is null`, asc(foods.name))
				.limit(SEARCH_LIMIT);
			return withUnits(rows);
		},

		async get(userId: string, id: string): Promise<FoodOption | null> {
			if (!UUID.test(id)) return null;
			const rows = await db
				.select({ id: foods.id, name: foods.name, userId: foods.userId })
				.from(foods)
				.where(and(eq(foods.id, id), visible(userId)))
				.limit(1);
			return (await withUnits(rows))[0] ?? null;
		},

		/** Creates a custom food owned by the user. Returns its id. */
		async create(userId: string, input: NewFoodInput): Promise<string> {
			const [row] = await db
				.insert(foods)
				.values({
					userId,
					name: input.name,
					source: 'custom',
					kcalPer100g: String(input.kcalPer100g),
					proteinPer100g: String(input.proteinPer100g),
					carbsPer100g: String(input.carbsPer100g),
					fatPer100g: String(input.fatPer100g)
				})
				.returning({ id: foods.id });
			return row.id;
		}
	};
};

export type FoodStore = ReturnType<typeof makeFoodStore>;

export const getFoodStore = (): FoodStore => makeFoodStore(getDb());
