import { and, asc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import { searchStem, suggestQuery } from '$lib/domain/food-match';
import type { FoodNutrition } from '$lib/domain/nutrition';
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

/** The row for a new custom food, with its id chosen up front so it can go in a batch. */
export const customFoodRow = (userId: string, input: NewFoodInput) => ({
	id: crypto.randomUUID(),
	userId,
	name: input.name,
	source: 'custom',
	kcalPer100g: String(input.kcalPer100g),
	proteinPer100g: String(input.proteinPer100g),
	carbsPer100g: String(input.carbsPer100g),
	fatPer100g: String(input.fatPer100g)
});

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
		/**
		 * Own and shared foods whose name contains every word of `query` (singular or plural), at
		 * most 20: own first, then names starting with the first word, then shorter names, then by name.
		 */
		async search(userId: string, query: string): Promise<FoodOption[]> {
			const stems = query
				.trim()
				.split(/\s+/)
				.filter(Boolean)
				.map((w) => escapeLike(searchStem(w)));
			if (stems.length === 0) return [];
			const rows = await db
				.select({ id: foods.id, name: foods.name, userId: foods.userId })
				.from(foods)
				.where(and(visible(userId), ...stems.map((w) => ilike(foods.name, `%${w}%`))))
				.orderBy(
					sql`${foods.userId} is null`,
					sql`${foods.name} ilike ${`${stems[0]}%`} desc`,
					sql`length(${foods.name})`,
					asc(foods.name)
				)
				.limit(SEARCH_LIMIT);
			return withUnits(rows);
		},

		/** The foods among `ids` the user can see, with their units. */
		async getMany(userId: string, ids: string[]): Promise<FoodOption[]> {
			const unique = [...new Set(ids)].filter((id) => UUID.test(id));
			if (unique.length === 0) return [];
			const rows = await db
				.select({ id: foods.id, name: foods.name, userId: foods.userId })
				.from(foods)
				.where(and(inArray(foods.id, unique), visible(userId)));
			return withUnits(rows);
		},

		/**
		 * The best food for each ingredient name (the top search hit for its `suggestQuery`), or null.
		 * Names are searched one by one; callers cap how many.
		 */
		async suggest(userId: string, names: string[]): Promise<(FoodOption | null)[]> {
			return Promise.all(
				names.map(async (name) => {
					const query = suggestQuery(name);
					if (!query) return null;
					const [best] = await this.search(userId, query);
					return best ?? null;
				})
			);
		},

		/** Per-100 g numbers and unit weights for the foods among `ids` the user can see. */
		async nutritionFor(userId: string, ids: string[]): Promise<Map<string, FoodNutrition>> {
			const unique = [...new Set(ids)].filter((id) => UUID.test(id));
			const map = new Map<string, FoodNutrition>();
			if (unique.length === 0) return map;
			const rows = await db
				.select({
					id: foods.id,
					kcal: foods.kcalPer100g,
					protein: foods.proteinPer100g,
					carbs: foods.carbsPer100g,
					fat: foods.fatPer100g
				})
				.from(foods)
				.where(and(inArray(foods.id, unique), visible(userId)));
			const units = rows.length
				? await db
						.select({ foodId: foodUnits.foodId, unit: foodUnits.unit, grams: foodUnits.grams })
						.from(foodUnits)
						.where(
							inArray(
								foodUnits.foodId,
								rows.map((r) => r.id)
							)
						)
				: [];
			for (const r of rows) {
				map.set(r.id, {
					id: r.id,
					kcalPer100g: Number(r.kcal),
					proteinPer100g: Number(r.protein),
					carbsPer100g: Number(r.carbs),
					fatPer100g: Number(r.fat),
					units: Object.fromEntries(
						units.filter((u) => u.foodId === r.id).map((u) => [u.unit, Number(u.grams)])
					)
				});
			}
			return map;
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
			const row = customFoodRow(userId, input);
			await db.insert(foods).values(row);
			return row.id;
		}
	};
};

export type FoodStore = ReturnType<typeof makeFoodStore>;

export const getFoodStore = (): FoodStore => makeFoodStore(getDb());
