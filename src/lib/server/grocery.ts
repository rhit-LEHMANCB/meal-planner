import { and, asc, eq, inArray, isNotNull, isNull, notInArray, or, sql } from 'drizzle-orm';
import { ingredientLine, type GroceryLine, type GrocerySource } from '$lib/domain/grocery';
import { GROCERY_LIMITS, type ExtraInput } from '$lib/domain/grocery-form';
import { SLOT_LABELS } from '$lib/domain/plan';
import type { Aisle } from '$lib/domain/aisles';
import { getDb, type Db } from './db';
import {
	foods,
	groceryAisleChoices,
	groceryItems,
	groceryLists,
	leftoverBatches,
	mealPlans,
	plannedMeals,
	recipeIngredients,
	recipes
} from './db/schema';

export interface ExtraItem {
	id: string;
	name: string;
	quantity: number | null;
	unit: string | null;
	checked: boolean;
}

export interface GroceryWeek {
	/** One per cook (scaled to servings cooked) and one per food entry. Leftovers never appear. */
	sources: GrocerySource[];
	cooks: number;
	foods: number;
	/** Item key → `ticked_amount` for each ticked derived item. */
	ticks: Map<string, string>;
	extras: ExtraItem[];
	/** Name key → aisle the user moved that name to. */
	choices: Map<string, string>;
}

export type GroceryResult<T = void> =
	| ({ ok: true } & (T extends void ? object : { value: T }))
	| { ok: false; reason: 'not_found' }
	| { ok: false; reason: 'too_many' };

const num = (v: string | null) => (v === null ? null : Number(v));

/**
 * The only code that touches the grocery tables. The list itself is rebuilt from the plan on
 * every load; rows here are user state: ticks, extra items and aisle choices. Every method takes
 * the owner's id, and lists are owned through `grocery_lists.plan_id → meal_plans.user_id`, so
 * anything another user owns looks exactly like something that does not exist.
 */
export const makeGroceryStore = (db: Db) => {
	const planIdFor = async (userId: string, monday: string) => {
		const [row] = await db
			.insert(mealPlans)
			.values({ userId, weekStart: monday })
			.onConflictDoUpdate({
				target: [mealPlans.userId, mealPlans.weekStart],
				set: { weekStart: monday }
			})
			.returning({ id: mealPlans.id });
		return row.id;
	};

	/** The week's list row, with its plan row, created if missing. */
	const listIdFor = async (userId: string, monday: string) => {
		const planId = await planIdFor(userId, monday);
		const [row] = await db
			.insert(groceryLists)
			.values({ planId })
			.onConflictDoUpdate({ target: groceryLists.planId, set: { planId } })
			.returning({ id: groceryLists.id });
		return row.id;
	};

	/** Ids of the user's lists for one week (zero or one), as a subquery. */
	const weekListIds = (userId: string, monday: string) =>
		db
			.select({ id: groceryLists.id })
			.from(groceryLists)
			.innerJoin(mealPlans, eq(mealPlans.id, groceryLists.planId))
			.where(and(eq(mealPlans.userId, userId), eq(mealPlans.weekStart, monday)));

	/** Owned extra item condition; table names written out because Drizzle prints bare columns here. */
	const ownedExtra = (userId: string, itemId: string) =>
		and(
			eq(groceryItems.id, itemId),
			eq(groceryItems.isExtra, true),
			sql`${groceryItems.listId} in (select l."id" from "grocery_lists" l join "meal_plans" m on m."id" = l."plan_id" where m."user_id" = ${userId})`
		);

	const loadChoices = async (userId: string) => {
		const rows = await db
			.select({ nameKey: groceryAisleChoices.nameKey, aisle: groceryAisleChoices.aisle })
			.from(groceryAisleChoices)
			.where(eq(groceryAisleChoices.userId, userId));
		return new Map(rows.map((r) => [r.nameKey, r.aisle]));
	};

	return {
		async getWeek(userId: string, monday: string): Promise<GroceryWeek> {
			const [plan] = await db
				.select({ id: mealPlans.id })
				.from(mealPlans)
				.where(and(eq(mealPlans.userId, userId), eq(mealPlans.weekStart, monday)))
				.limit(1);
			if (!plan) {
				return {
					sources: [],
					cooks: 0,
					foods: 0,
					ticks: new Map(),
					extras: [],
					choices: await loadChoices(userId)
				};
			}

			const [cookRows, foodRows, itemRows, choices] = await Promise.all([
				// Cooks: not leftovers, not foods, the user's own recipe, with the batch's servings cooked.
				db
					.select({
						id: plannedMeals.id,
						recipeId: recipes.id,
						title: recipes.title,
						recipeServings: recipes.servings,
						cooked: leftoverBatches.servingsCooked,
						eaten: plannedMeals.servings
					})
					.from(plannedMeals)
					.innerJoin(mealPlans, eq(mealPlans.id, plannedMeals.planId))
					.innerJoin(
						recipes,
						and(eq(recipes.id, plannedMeals.recipeId), eq(recipes.userId, userId))
					)
					.leftJoin(leftoverBatches, eq(leftoverBatches.cookMealId, plannedMeals.id))
					.where(
						and(
							eq(plannedMeals.planId, plan.id),
							eq(mealPlans.userId, userId),
							eq(plannedMeals.isLeftover, false),
							isNull(plannedMeals.foodId)
						)
					)
					.orderBy(asc(plannedMeals.date), asc(plannedMeals.slot), asc(plannedMeals.position)),
				// Food entries, on foods the user can see.
				db
					.select({
						slot: plannedMeals.slot,
						quantity: plannedMeals.quantity,
						unit: plannedMeals.unit,
						name: foods.name,
						aisle: foods.aisle
					})
					.from(plannedMeals)
					.innerJoin(mealPlans, eq(mealPlans.id, plannedMeals.planId))
					.innerJoin(
						foods,
						and(
							eq(foods.id, plannedMeals.foodId),
							or(isNull(foods.userId), eq(foods.userId, userId))
						)
					)
					.where(
						and(
							eq(plannedMeals.planId, plan.id),
							eq(mealPlans.userId, userId),
							eq(plannedMeals.isLeftover, false)
						)
					)
					.orderBy(asc(plannedMeals.date), asc(plannedMeals.slot), asc(plannedMeals.position)),
				db
					.select({
						id: groceryItems.id,
						itemKey: groceryItems.itemKey,
						isExtra: groceryItems.isExtra,
						name: groceryItems.name,
						quantity: groceryItems.quantity,
						unit: groceryItems.unit,
						checked: groceryItems.checked,
						tickedAmount: groceryItems.tickedAmount
					})
					.from(groceryItems)
					.innerJoin(groceryLists, eq(groceryLists.id, groceryItems.listId))
					.where(eq(groceryLists.planId, plan.id))
					.orderBy(asc(groceryItems.name)),
				loadChoices(userId)
			]);

			const recipeIds = [...new Set(cookRows.map((c) => c.recipeId))];
			const ingredientRows = recipeIds.length
				? await db
						.select({
							recipeId: recipeIngredients.recipeId,
							rawText: recipeIngredients.rawText,
							name: recipeIngredients.name,
							quantity: recipeIngredients.quantity,
							unit: recipeIngredients.unit
						})
						.from(recipeIngredients)
						.innerJoin(
							recipes,
							and(eq(recipes.id, recipeIngredients.recipeId), eq(recipes.userId, userId))
						)
						.where(inArray(recipeIngredients.recipeId, recipeIds))
						.orderBy(asc(recipeIngredients.position))
				: [];

			const linesByRecipe = new Map<string, GroceryLine[]>();
			for (const row of ingredientRows) {
				const lines = linesByRecipe.get(row.recipeId) ?? [];
				lines.push(ingredientLine({ ...row, quantity: num(row.quantity) }));
				linesByRecipe.set(row.recipeId, lines);
			}

			const sources: GrocerySource[] = [
				...cookRows.map((c) => ({
					meal: c.title,
					// A cook without its batch (should not happen) buys for what is eaten.
					scale: c.recipeServings >= 1 ? (c.cooked ?? c.eaten) / c.recipeServings : null,
					lines: linesByRecipe.get(c.recipeId) ?? []
				})),
				...foodRows.map((f) => ({
					meal: SLOT_LABELS[f.slot],
					scale: 1,
					lines: [{ name: f.name, quantity: num(f.quantity), unit: f.unit, aisle: f.aisle }]
				}))
			];

			const ticks = new Map<string, string>();
			const extras: ExtraItem[] = [];
			for (const row of itemRows) {
				if (row.isExtra) {
					extras.push({
						id: row.id,
						name: row.name,
						quantity: num(row.quantity),
						unit: row.unit,
						checked: row.checked
					});
				} else if (row.itemKey && row.checked && row.tickedAmount !== null) {
					ticks.set(row.itemKey, row.tickedAmount);
				}
			}

			return { sources, cooks: cookRows.length, foods: foodRows.length, ticks, extras, choices };
		},

		/**
		 * Ticks (with the item's current amounts) or unticks a derived item. Sets the state given,
		 * so repeating it changes nothing. Ticking also drops ticks for items no longer on the list.
		 */
		async setTick(
			userId: string,
			monday: string,
			item: { key: string; name: string; snapshot: string | null },
			liveKeys: string[]
		): Promise<void> {
			if (item.snapshot === null) {
				await db
					.delete(groceryItems)
					.where(
						and(
							eq(groceryItems.itemKey, item.key),
							inArray(groceryItems.listId, weekListIds(userId, monday))
						)
					);
				return;
			}
			const listId = await listIdFor(userId, monday);
			await db.batch([
				db
					.insert(groceryItems)
					.values({
						listId,
						itemKey: item.key,
						name: item.name,
						checked: true,
						tickedAmount: item.snapshot
					})
					.onConflictDoUpdate({
						target: [groceryItems.listId, groceryItems.itemKey],
						set: { checked: true, tickedAmount: item.snapshot, name: item.name }
					}),
				db
					.delete(groceryItems)
					.where(
						and(
							eq(groceryItems.listId, listId),
							isNotNull(groceryItems.itemKey),
							notInArray(groceryItems.itemKey, [...new Set([item.key, ...liveKeys])])
						)
					)
			]);
		},

		/** Adds an extra item to the week, refusing past the per-week cap in the same statement. */
		async addExtra(
			userId: string,
			monday: string,
			input: ExtraInput
		): Promise<GroceryResult<string>> {
			const listId = await listIdFor(userId, monday);
			const result = await db.execute<{ id: string }>(sql`
				insert into "grocery_items" ("list_id", "name", "quantity", "unit", "is_extra")
				select ${listId}, ${input.name}, ${input.quantity}, ${input.unit}, true
				where (
					select count(*) from "grocery_items" g where g."list_id" = ${listId} and g."is_extra"
				) < ${GROCERY_LIMITS.extrasPerWeek}
				returning "id"
			`);
			const id = result.rows[0]?.id;
			return id ? { ok: true, value: id } : { ok: false, reason: 'too_many' };
		},

		async setExtraChecked(
			userId: string,
			itemId: string,
			checked: boolean
		): Promise<GroceryResult> {
			const rows = await db
				.update(groceryItems)
				.set({ checked })
				.where(ownedExtra(userId, itemId))
				.returning({ id: groceryItems.id });
			return rows.length ? { ok: true } : { ok: false, reason: 'not_found' };
		},

		async removeExtra(userId: string, itemId: string): Promise<GroceryResult> {
			const rows = await db
				.delete(groceryItems)
				.where(ownedExtra(userId, itemId))
				.returning({ id: groceryItems.id });
			return rows.length ? { ok: true } : { ok: false, reason: 'not_found' };
		},

		/** Remembers the aisle for a name key; applies to every week. */
		async setAisle(userId: string, nameKey: string, aisle: Aisle): Promise<void> {
			await db
				.insert(groceryAisleChoices)
				.values({ userId, nameKey, aisle })
				.onConflictDoUpdate({
					target: [groceryAisleChoices.userId, groceryAisleChoices.nameKey],
					set: { aisle }
				});
		}
	};
};

export type GroceryStore = ReturnType<typeof makeGroceryStore>;

export const getGroceryStore = (): GroceryStore => makeGroceryStore(getDb());
