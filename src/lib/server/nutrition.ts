import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm';
import { formatAmount } from '$lib/domain/ingredient-line';
import {
	amountGrams,
	DEFAULT_GOALS,
	entryNutrition,
	macrosForGrams,
	recipeNutrition,
	scaleMacros,
	type EntryNutrition,
	type FoodNutrition,
	type Macros,
	type NutritionGoals,
	type RecipeNutrition
} from '$lib/domain/nutrition';
import type { LogInput } from '$lib/domain/nutrition-form';
import { addDays, type PlanEntry, type Slot } from '$lib/domain/plan';
import { getDb, type Db } from './db';
import { foodLog, foods, nutritionGoals, recipeIngredients, recipes } from './db/schema';
import { makeFoodStore } from './foods';

export interface LogEntry {
	id: string;
	date: string;
	slot: Slot | null;
	label: string;
	macros: Macros;
}

export type LogResult =
	{ ok: true } | { ok: false; reason: 'not_found' | 'bad_unit' | 'too_large' };

/** `food_log` numbers are numeric(8,2). */
const LOG_MAX = 999999;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const decimal2 = (n: number) => String(Math.round(n * 100) / 100);

/**
 * Nutrition for planned meals, the food log and daily goals. Every method takes the owner's id:
 * recipes are read only when `recipes.user_id` matches, foods only when visible to the user, and
 * log entries and goals only for the user's own rows. Anything else looks like it does not exist.
 * Planned numbers are computed from current data; log entries store theirs when logged.
 */
export const makeNutritionStore = (db: Db) => {
	const foodStore = makeFoodStore(db);

	/** Nutrition per serving for the user's own recipes among `ids` (two queries plus foods). */
	const recipesNutrition = async (
		userId: string,
		ids: string[]
	): Promise<{
		recipes: Map<string, RecipeNutrition & { title: string }>;
		foods: Map<string, FoodNutrition>;
	}> => {
		const unique = [...new Set(ids)].filter((id) => UUID.test(id));
		const owned = unique.length
			? await db
					.select({ id: recipes.id, title: recipes.title, servings: recipes.servings })
					.from(recipes)
					.where(and(inArray(recipes.id, unique), eq(recipes.userId, userId)))
			: [];
		const rows = owned.length
			? await db
					.select({
						recipeId: recipeIngredients.recipeId,
						name: recipeIngredients.name,
						quantity: recipeIngredients.quantity,
						unit: recipeIngredients.unit,
						foodId: recipeIngredients.foodId,
						grams: recipeIngredients.grams
					})
					.from(recipeIngredients)
					.where(
						inArray(
							recipeIngredients.recipeId,
							owned.map((r) => r.id)
						)
					)
			: [];
		const foodsById = await foodStore.nutritionFor(
			userId,
			rows.flatMap((r) => (r.foodId ? [r.foodId] : []))
		);
		const map = new Map<string, RecipeNutrition & { title: string }>();
		for (const recipe of owned) {
			const own = rows
				.filter((r) => r.recipeId === recipe.id)
				.map((r) => ({
					name: r.name,
					quantity: r.quantity === null ? null : Number(r.quantity),
					unit: r.unit,
					foodId: r.foodId,
					grams: r.grams === null ? null : Number(r.grams)
				}));
			map.set(recipe.id, {
				title: recipe.title,
				...recipeNutrition(own, foodsById, recipe.servings)
			});
		}
		return { recipes: map, foods: foodsById };
	};

	return {
		recipesNutrition,

		/** Each planned entry's nutrition, for entries already loaded through the plan store. */
		async plannedNutrition(
			userId: string,
			entries: PlanEntry[]
		): Promise<{ date: string; nutrition: EntryNutrition }[]> {
			const { recipes: byRecipe } = await recipesNutrition(
				userId,
				entries.flatMap((e) => (e.recipeId ? [e.recipeId] : []))
			);
			const entryFoods = await foodStore.nutritionFor(
				userId,
				entries.flatMap((e) => (e.foodId ? [e.foodId] : []))
			);
			return entries.map((e) => ({
				date: e.date,
				nutrition: entryNutrition(e, byRecipe, entryFoods)
			}));
		},

		/** The user's log entries for the week starting `monday`, by date then the order logged. */
		async logsForWeek(userId: string, monday: string): Promise<LogEntry[]> {
			const rows = await db
				.select({
					id: foodLog.id,
					date: foodLog.date,
					slot: foodLog.slot,
					label: foodLog.label,
					kcal: foodLog.kcal,
					protein: foodLog.proteinG,
					carbs: foodLog.carbsG,
					fat: foodLog.fatG
				})
				.from(foodLog)
				.where(
					and(
						eq(foodLog.userId, userId),
						gte(foodLog.date, monday),
						lte(foodLog.date, addDays(monday, 6))
					)
				)
				.orderBy(asc(foodLog.date), asc(foodLog.loggedAt), asc(foodLog.id));
			return rows.map((r) => ({
				id: r.id,
				date: r.date,
				slot: r.slot,
				label: r.label,
				macros: {
					kcal: Number(r.kcal),
					proteinG: Number(r.protein),
					carbsG: Number(r.carbs),
					fatG: Number(r.fat)
				}
			}));
		},

		/** Logs a food or a recipe with its numbers fixed now. Another user's item is not found. */
		async log(userId: string, input: LogInput): Promise<LogResult> {
			let row: {
				label: string;
				recipeId: string | null;
				foodId: string | null;
				servings: number;
				macros: Macros;
			};
			if (input.kind === 'food') {
				const food = (await foodStore.nutritionFor(userId, [input.foodId])).get(input.foodId);
				if (!food) return { ok: false, reason: 'not_found' };
				const unit = input.unit === 'g' ? 'g' : input.unit;
				if (unit !== 'g' && !Object.hasOwn(food.units, unit))
					return { ok: false, reason: 'bad_unit' };
				const grams = amountGrams(input.amount, unit, food);
				if (grams === null || !Number.isFinite(grams)) return { ok: false, reason: 'bad_unit' };
				const [named] = await db
					.select({ name: foods.name })
					.from(foods)
					.where(eq(foods.id, food.id))
					.limit(1);
				row = {
					label: `${named?.name ?? 'Food'} · ${formatAmount(input.amount)} ${unit}`,
					recipeId: null,
					foodId: food.id,
					servings: 1,
					macros: macrosForGrams(food, grams)
				};
			} else {
				const recipe = (await recipesNutrition(userId, [input.recipeId])).recipes.get(
					input.recipeId
				);
				if (!recipe) return { ok: false, reason: 'not_found' };
				row = {
					label: `${recipe.title} · ${formatAmount(input.servings)} ${input.servings === 1 ? 'serving' : 'servings'}`,
					recipeId: input.recipeId,
					foodId: null,
					servings: input.servings,
					macros: scaleMacros(recipe.perServing, input.servings)
				};
			}
			const values = [row.macros.kcal, row.macros.proteinG, row.macros.carbsG, row.macros.fatG];
			if (!values.every((v) => Number.isFinite(v) && v <= LOG_MAX)) {
				return { ok: false, reason: 'too_large' };
			}
			await db.insert(foodLog).values({
				userId,
				date: input.date,
				slot: input.slot,
				label: row.label,
				recipeId: row.recipeId,
				foodId: row.foodId,
				servings: decimal2(row.servings),
				kcal: decimal2(row.macros.kcal),
				proteinG: decimal2(row.macros.proteinG),
				carbsG: decimal2(row.macros.carbsG),
				fatG: decimal2(row.macros.fatG)
			});
			return { ok: true };
		},

		/** Deletes one of the user's log entries. False when there is no such entry of theirs. */
		async removeLog(userId: string, id: string): Promise<boolean> {
			if (!UUID.test(id)) return false;
			const deleted = await db
				.delete(foodLog)
				.where(and(eq(foodLog.id, id), eq(foodLog.userId, userId)))
				.returning({ id: foodLog.id });
			return deleted.length > 0;
		},

		/** The user's daily goals, or the defaults when they never saved any. */
		async getGoals(userId: string): Promise<NutritionGoals> {
			const [row] = await db
				.select({
					kcal: nutritionGoals.kcal,
					proteinG: nutritionGoals.proteinG,
					carbsG: nutritionGoals.carbsG,
					fatG: nutritionGoals.fatG
				})
				.from(nutritionGoals)
				.where(eq(nutritionGoals.userId, userId))
				.limit(1);
			return row ?? DEFAULT_GOALS;
		},

		async saveGoals(userId: string, goals: NutritionGoals): Promise<void> {
			await db
				.insert(nutritionGoals)
				.values({ userId, ...goals })
				.onConflictDoUpdate({ target: nutritionGoals.userId, set: goals });
		}
	};
};

export type NutritionStore = ReturnType<typeof makeNutritionStore>;

export const getNutritionStore = (): NutritionStore => makeNutritionStore(getDb());
