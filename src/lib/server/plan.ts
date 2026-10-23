import { aliasedTable, and, asc, eq, gte, inArray, isNull, or, sql } from 'drizzle-orm';
import {
	addDays,
	batchState,
	eatByFor,
	finishedOn,
	isAfterCook,
	isPastEatBy,
	mondayOf,
	type Batch,
	type BatchDraw,
	type EntryKind,
	type PlanEntry,
	type Slot
} from '$lib/domain/plan';
import type { CookInput, EntryUpdate, LeftoverInput, SlotTarget } from '$lib/domain/plan-form';
import { getDb, type Db } from './db';
import { foodUnits, foods, leftoverBatches, mealPlans, plannedMeals, recipes } from './db/schema';
import { makeFoodStore } from './foods';

export type { Batch, BatchDraw, PlanEntry };

export type PlanResult<T = void> =
	| ({ ok: true } & (T extends void ? object : { value: T }))
	| { ok: false; reason: 'not_found' }
	| { ok: false; reason: 'before_cook' }
	| { ok: false; reason: 'not_enough'; free: number }
	| { ok: false; reason: 'below_drawn'; drawn: number }
	| { ok: false; reason: 'bad_unit' }
	| { ok: false; reason: 'gone' }
	| { ok: false; reason: 'has_leftovers'; draws: BatchDraw[] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** How far back to look for batches that may have left the fridge recently. */
const RECENT_BATCH_DAYS = 60;

const cookBatch = aliasedTable(leftoverBatches, 'cook_batch');
const drawBatch = aliasedTable(leftoverBatches, 'draw_batch');

/**
 * The only code that touches the plan and leftover tables (apart from recipe delete, which removes
 * a recipe's planned meals and batches). Every method takes the owner's id and every query filters
 * by it, through `meal_plans.user_id` for entries and `leftover_batches.user_id` for batches.
 * Anything another user owns looks exactly like something that does not exist.
 *
 * `leftover_batches.servings_remaining` holds the batch's free servings. It is only changed by
 * single statements whose WHERE clause re-checks it, so two requests racing for the last serving
 * cannot both win: the second UPDATE re-evaluates its condition after the first commits.
 */
export const makePlanStore = (db: Db) => {
	const foodStore = makeFoodStore(db);

	const ownedPlanIds = (userId: string) =>
		db.select({ id: mealPlans.id }).from(mealPlans).where(eq(mealPlans.userId, userId));

	/** The user's plan row for the week starting `monday`, created if missing. */
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

	/** Next position in a slot; table names written out because Drizzle prints bare columns here. */
	const nextPosition = (planId: string, date: string, slot: Slot) =>
		sql`coalesce((select max(p."position") + 1 from "planned_meals" p where p."plan_id" = ${planId} and p."date" = ${date} and p."slot" = ${slot}), 0)`;

	const entryRows = (userId: string) =>
		db
			.select({
				id: plannedMeals.id,
				date: plannedMeals.date,
				slot: plannedMeals.slot,
				position: plannedMeals.position,
				servings: plannedMeals.servings,
				isLeftover: plannedMeals.isLeftover,
				recipeId: plannedMeals.recipeId,
				foodId: plannedMeals.foodId,
				quantity: plannedMeals.quantity,
				unit: plannedMeals.unit,
				weekStart: mealPlans.weekStart,
				recipeTitle: recipes.title,
				foodName: foods.name,
				cookBatchId: cookBatch.id,
				cookBatchCooked: cookBatch.servingsCooked,
				cookBatchFree: cookBatch.servingsRemaining,
				cookBatchThrown: cookBatch.thrownOutAt,
				drawBatchId: drawBatch.id,
				drawBatchEatBy: drawBatch.eatBy,
				drawBatchThrown: drawBatch.thrownOutAt
			})
			.from(plannedMeals)
			.innerJoin(
				mealPlans,
				and(eq(mealPlans.id, plannedMeals.planId), eq(mealPlans.userId, userId))
			)
			.leftJoin(recipes, eq(recipes.id, plannedMeals.recipeId))
			.leftJoin(foods, eq(foods.id, plannedMeals.foodId))
			.leftJoin(cookBatch, eq(cookBatch.cookMealId, plannedMeals.id))
			.leftJoin(drawBatch, eq(drawBatch.id, plannedMeals.leftoverBatchId));

	type EntryRow = Awaited<ReturnType<ReturnType<typeof entryRows>['execute']>>[number];

	const kindOf = (row: EntryRow): EntryKind =>
		row.foodId ? 'food' : row.isLeftover ? 'leftover' : 'cook';

	/** Servings drawn from a cook's batch: spare minus free (a thrown-out batch counts its draws). */
	const drawnFor = async (batchId: string) => {
		const [row] = await db
			.select({ drawn: sql<number>`coalesce(sum(${plannedMeals.servings}), 0)::int` })
			.from(plannedMeals)
			.where(eq(plannedMeals.leftoverBatchId, batchId));
		return row?.drawn ?? 0;
	};

	const toEntry = (
		row: EntryRow,
		units: Map<string, string[]>,
		drawn: Map<string, number>
	): PlanEntry => {
		const kind = kindOf(row);
		const batchId =
			kind === 'cook' ? row.cookBatchId : kind === 'leftover' ? row.drawBatchId : null;
		return {
			id: row.id,
			date: row.date,
			slot: row.slot,
			kind,
			title: (kind === 'food' ? row.foodName : row.recipeTitle) ?? '',
			servings: row.servings,
			cooked: kind === 'cook' ? (row.cookBatchCooked ?? row.servings) : null,
			drawn: kind === 'cook' && batchId ? (drawn.get(batchId) ?? 0) : 0,
			batchId,
			eatBy: kind === 'leftover' ? row.drawBatchEatBy : null,
			pastEatBy: kind === 'leftover' && isPastEatBy(row.drawBatchEatBy, row.date),
			gone: kind === 'leftover' && row.drawBatchThrown !== null,
			foodId: row.foodId,
			amount: row.quantity === null ? null : Number(row.quantity),
			unit: row.unit,
			units: row.foodId ? (units.get(row.foodId) ?? ['g']) : []
		};
	};

	const unitsFor = async (foodIds: string[]) => {
		const map = new Map<string, string[]>();
		if (foodIds.length === 0) return map;
		const rows = await db
			.select({ foodId: foodUnits.foodId, unit: foodUnits.unit })
			.from(foodUnits)
			.where(inArray(foodUnits.foodId, foodIds))
			.orderBy(asc(foodUnits.unit));
		for (const id of foodIds) map.set(id, ['g']);
		for (const r of rows) if (r.unit !== 'g') map.get(r.foodId)?.push(r.unit);
		return map;
	};

	const drawnByBatch = async (batchIds: string[]) => {
		const map = new Map<string, number>();
		if (batchIds.length === 0) return map;
		const rows = await db
			.select({
				batchId: plannedMeals.leftoverBatchId,
				drawn: sql<number>`sum(${plannedMeals.servings})::int`
			})
			.from(plannedMeals)
			.where(inArray(plannedMeals.leftoverBatchId, batchIds))
			.groupBy(plannedMeals.leftoverBatchId);
		for (const r of rows) if (r.batchId) map.set(r.batchId, r.drawn);
		return map;
	};

	/** One entry the user owns, or null. */
	const loadEntry = async (userId: string, entryId: string) => {
		if (!UUID.test(entryId)) return null;
		const [row] = await entryRows(userId).where(eq(plannedMeals.id, entryId)).limit(1);
		return row ?? null;
	};

	/** A batch the user owns with its cook's slot, or null. */
	const loadBatch = async (userId: string, batchId: string) => {
		if (!UUID.test(batchId)) return null;
		const [row] = await db
			.select({
				id: leftoverBatches.id,
				recipeId: leftoverBatches.recipeId,
				cookedOn: leftoverBatches.cookedOn,
				free: leftoverBatches.servingsRemaining,
				thrownOutAt: leftoverBatches.thrownOutAt,
				cookSlot: plannedMeals.slot
			})
			.from(leftoverBatches)
			.leftJoin(plannedMeals, eq(plannedMeals.id, leftoverBatches.cookMealId))
			.where(and(eq(leftoverBatches.id, batchId), eq(leftoverBatches.userId, userId)))
			.limit(1);
		return row ?? null;
	};

	return {
		/** Every entry in the user's week starting `monday`, by date, slot and position. */
		async getWeek(userId: string, monday: string): Promise<PlanEntry[]> {
			const rows = await entryRows(userId)
				.where(eq(mealPlans.weekStart, monday))
				.orderBy(asc(plannedMeals.date), asc(plannedMeals.slot), asc(plannedMeals.position));
			const units = await unitsFor([...new Set(rows.flatMap((r) => (r.foodId ? [r.foodId] : [])))]);
			const drawn = await drawnByBatch(rows.flatMap((r) => (r.cookBatchId ? [r.cookBatchId] : [])));
			return rows.map((row) => toEntry(row, units, drawn));
		},

		/**
		 * The user's batches that are in the fridge or left it in the last 14 days, oldest cook first,
		 * each with its planned leftovers and state as of `today`.
		 */
		async listBatches(userId: string, today: string): Promise<Batch[]> {
			const since = addDays(today, -RECENT_BATCH_DAYS);
			const rows = await db
				.select({
					id: leftoverBatches.id,
					recipeId: leftoverBatches.recipeId,
					title: recipes.title,
					cookedOn: leftoverBatches.cookedOn,
					eatBy: leftoverBatches.eatBy,
					cooked: leftoverBatches.servingsCooked,
					free: leftoverBatches.servingsRemaining,
					thrownOutAt: leftoverBatches.thrownOutAt,
					cookSlot: plannedMeals.slot,
					eaten: plannedMeals.servings
				})
				.from(leftoverBatches)
				.innerJoin(recipes, eq(recipes.id, leftoverBatches.recipeId))
				.leftJoin(plannedMeals, eq(plannedMeals.id, leftoverBatches.cookMealId))
				.where(
					and(
						eq(leftoverBatches.userId, userId),
						or(
							and(
								isNull(leftoverBatches.thrownOutAt),
								sql`${leftoverBatches.servingsRemaining} > 0`
							),
							gte(leftoverBatches.cookedOn, since)
						)
					)
				)
				.orderBy(asc(leftoverBatches.cookedOn), asc(plannedMeals.slot));

			const ids = rows.map((r) => r.id);
			const draws = ids.length
				? await db
						.select({
							entryId: plannedMeals.id,
							batchId: plannedMeals.leftoverBatchId,
							date: plannedMeals.date,
							slot: plannedMeals.slot,
							servings: plannedMeals.servings
						})
						.from(plannedMeals)
						.innerJoin(
							mealPlans,
							and(eq(mealPlans.id, plannedMeals.planId), eq(mealPlans.userId, userId))
						)
						.where(inArray(plannedMeals.leftoverBatchId, ids))
						.orderBy(asc(plannedMeals.date), asc(plannedMeals.slot), asc(plannedMeals.position))
				: [];

			const oldest = addDays(today, -14);
			return rows
				.map((r): Batch => {
					const eaten = r.eaten ?? 0;
					const own = draws.filter((d) => d.batchId === r.id);
					const drawDates = own.map((d) => d.date);
					const state = batchState(
						{ free: r.free, thrownOut: r.thrownOutAt !== null, drawDates },
						today
					);
					const leftOn =
						state === 'thrown_out'
							? (r.thrownOutAt as Date).toISOString().slice(0, 10)
							: state === 'finished'
								? finishedOn(r.cookedOn, drawDates)
								: null;
					return {
						id: r.id,
						recipeId: r.recipeId,
						title: r.title,
						cookedOn: r.cookedOn,
						cookSlot: r.cookSlot,
						eatBy: r.eatBy,
						cooked: r.cooked,
						eaten,
						spare: r.cooked - eaten,
						free: r.free,
						thrownOutAt: r.thrownOutAt,
						draws: own.map((d) => ({
							entryId: d.entryId,
							date: d.date,
							slot: d.slot,
							servings: d.servings,
							pastEatBy: isPastEatBy(r.eatBy, d.date)
						})),
						state,
						leftOn
					};
				})
				.filter(
					(b) =>
						// A cook with nothing spare never made leftovers.
						b.spare > 0 &&
						(b.state === 'fridge' || (b.leftOn !== null && b.leftOn >= oldest && b.leftOn <= today))
				);
		},

		/** Adds a cook of one of the user's recipes and the batch its spare servings make. */
		async addCook(userId: string, input: CookInput): Promise<PlanResult<string>> {
			if (!UUID.test(input.recipeId)) return { ok: false, reason: 'not_found' };
			const [recipe] = await db
				.select({ id: recipes.id })
				.from(recipes)
				.where(and(eq(recipes.id, input.recipeId), eq(recipes.userId, userId)))
				.limit(1);
			if (!recipe) return { ok: false, reason: 'not_found' };

			const planId = await planIdFor(userId, mondayOf(input.date));
			const mealId = crypto.randomUUID();
			await db.batch([
				db.insert(plannedMeals).values({
					id: mealId,
					planId,
					date: input.date,
					slot: input.slot,
					recipeId: input.recipeId,
					servings: input.eaten,
					position: nextPosition(planId, input.date, input.slot)
				}),
				db.insert(leftoverBatches).values({
					userId,
					recipeId: input.recipeId,
					cookedOn: input.date,
					servingsCooked: input.cooked,
					servingsRemaining: input.cooked - input.eaten,
					eatBy: eatByFor(input.date),
					cookMealId: mealId
				})
			]);
			return { ok: true, value: mealId };
		},

		/** Adds a food the user can see, in grams or one of its units. */
		async addFood(
			userId: string,
			input: SlotTarget & { foodId: string; amount: number; unit: string }
		): Promise<PlanResult<string>> {
			const food = await foodStore.get(userId, input.foodId);
			if (!food) return { ok: false, reason: 'not_found' };
			if (!food.units.includes(input.unit)) return { ok: false, reason: 'bad_unit' };

			const planId = await planIdFor(userId, mondayOf(input.date));
			const [row] = await db
				.insert(plannedMeals)
				.values({
					planId,
					date: input.date,
					slot: input.slot,
					foodId: food.id,
					quantity: String(input.amount),
					unit: input.unit,
					position: nextPosition(planId, input.date, input.slot)
				})
				.returning({ id: plannedMeals.id });
			return { ok: true, value: row.id };
		},

		/**
		 * Draws servings from one of the user's batches into a slot after its cook. The decrement and
		 * the insert are one statement, so the batch can never be over-drawn.
		 */
		async addLeftover(userId: string, input: LeftoverInput): Promise<PlanResult<string>> {
			const batch = await loadBatch(userId, input.batchId);
			if (!batch) return { ok: false, reason: 'not_found' };
			if (batch.thrownOutAt) return { ok: false, reason: 'gone' };
			if (!isAfterCook({ date: batch.cookedOn, slot: batch.cookSlot ?? 'breakfast' }, input))
				return { ok: false, reason: 'before_cook' };

			const planId = await planIdFor(userId, mondayOf(input.date));
			const id = crypto.randomUUID();
			const result = await db.execute<{ id: string }>(sql`
				with b as (
					update "leftover_batches"
					set "servings_remaining" = "servings_remaining" - ${input.servings}
					where "id" = ${batch.id} and "user_id" = ${userId}
						and "thrown_out_at" is null and "servings_remaining" >= ${input.servings}
					returning "id", "recipe_id"
				)
				insert into "planned_meals"
					("id", "plan_id", "date", "slot", "recipe_id", "servings", "is_leftover", "leftover_batch_id", "position")
				select ${id}, ${planId}, ${input.date}, ${input.slot}::meal_slot, b."recipe_id", ${input.servings}, true, b."id",
					${nextPosition(planId, input.date, input.slot)}
				from b
				returning "id"`);
			if (result.rows.length === 0) {
				const now = await loadBatch(userId, batch.id);
				if (!now) return { ok: false, reason: 'not_found' };
				if (now.thrownOutAt) return { ok: false, reason: 'gone' };
				return { ok: false, reason: 'not_enough', free: now.free };
			}
			return { ok: true, value: id };
		},

		/** Changes an entry's amounts, keeping its batch's free servings at 0 or more. */
		async updateEntry(userId: string, entryId: string, update: EntryUpdate): Promise<PlanResult> {
			const entry = await loadEntry(userId, entryId);
			if (!entry || kindOf(entry) !== update.kind) return { ok: false, reason: 'not_found' };

			if (update.kind === 'food') {
				const food = entry.foodId ? await foodStore.get(userId, entry.foodId) : null;
				if (!food) return { ok: false, reason: 'not_found' };
				if (!food.units.includes(update.unit)) return { ok: false, reason: 'bad_unit' };
				await db
					.update(plannedMeals)
					.set({ quantity: String(update.amount), unit: update.unit })
					.where(
						and(eq(plannedMeals.id, entry.id), inArray(plannedMeals.planId, ownedPlanIds(userId)))
					);
				return { ok: true };
			}

			if (update.kind === 'cook') {
				const spare = update.cooked - update.eaten;
				// New free = old free + (new spare - old spare); a thrown-out batch stays at 0 free.
				const result = await db.execute<{ id: string }>(sql`
					with b as (
						update "leftover_batches" lb
						set "servings_cooked" = ${update.cooked},
							"servings_remaining" = case when lb."thrown_out_at" is null
								then lb."servings_remaining" + (${spare} - (lb."servings_cooked" - pm."servings"))
								else 0 end
						from "planned_meals" pm
						where pm."id" = lb."cook_meal_id" and lb."cook_meal_id" = ${entry.id}
							and lb."user_id" = ${userId}
							and (lb."thrown_out_at" is not null
								or lb."servings_remaining" + (${spare} - (lb."servings_cooked" - pm."servings")) >= 0)
						returning lb."id"
					)
					update "planned_meals" set "servings" = ${update.eaten}
					where "id" = ${entry.id} and exists (select 1 from b)
					returning "id"`);
				if (result.rows.length === 0) {
					if (!entry.cookBatchId) return { ok: false, reason: 'not_found' };
					return { ok: false, reason: 'below_drawn', drawn: await drawnFor(entry.cookBatchId) };
				}
				return { ok: true };
			}

			// Leftover: move the difference between the batch and the entry in one statement.
			if (entry.drawBatchThrown) return { ok: false, reason: 'gone' };
			const result = await db.execute<{ id: string }>(sql`
				with pm as (
					select p."id", p."servings", p."leftover_batch_id" from "planned_meals" p
					where p."id" = ${entry.id} and p."is_leftover"
						and p."plan_id" in (select m."id" from "meal_plans" m where m."user_id" = ${userId})
				), b as (
					update "leftover_batches" lb
					set "servings_remaining" = lb."servings_remaining" - (${update.servings} - pm."servings")
					from pm
					where lb."id" = pm."leftover_batch_id" and lb."user_id" = ${userId}
						and lb."thrown_out_at" is null
						and lb."servings_remaining" - (${update.servings} - pm."servings") >= 0
					returning lb."id"
				)
				update "planned_meals" set "servings" = ${update.servings}
				where "id" = ${entry.id} and exists (select 1 from b)
				returning "id"`);
			if (result.rows.length === 0) {
				const batch = entry.drawBatchId ? await loadBatch(userId, entry.drawBatchId) : null;
				if (!batch) return { ok: false, reason: 'not_found' };
				if (batch.thrownOutAt) return { ok: false, reason: 'gone' };
				return { ok: false, reason: 'not_enough', free: batch.free + entry.servings };
			}
			return { ok: true };
		},

		/**
		 * Removes an entry. A leftover gives its servings back. A cook whose batch has planned
		 * leftovers needs `confirm`, and then removes those leftovers and the batch with it.
		 */
		async removeEntry(userId: string, entryId: string, confirm = false): Promise<PlanResult> {
			const entry = await loadEntry(userId, entryId);
			if (!entry) return { ok: false, reason: 'not_found' };
			const owned = inArray(plannedMeals.planId, ownedPlanIds(userId));
			const kind = kindOf(entry);

			if (kind === 'food') {
				await db.delete(plannedMeals).where(and(eq(plannedMeals.id, entry.id), owned));
				return { ok: true };
			}

			if (kind === 'leftover') {
				await db.execute(sql`
					with d as (
						delete from "planned_meals" p
						where p."id" = ${entry.id}
							and p."plan_id" in (select m."id" from "meal_plans" m where m."user_id" = ${userId})
						returning p."leftover_batch_id", p."servings"
					)
					update "leftover_batches" lb
					set "servings_remaining" = lb."servings_remaining" + d."servings"
					from d
					where lb."id" = d."leftover_batch_id" and lb."user_id" = ${userId} and lb."thrown_out_at" is null`);
				return { ok: true };
			}

			const batchId = entry.cookBatchId;
			if (batchId) {
				const draws = await db
					.select({
						entryId: plannedMeals.id,
						date: plannedMeals.date,
						slot: plannedMeals.slot,
						servings: plannedMeals.servings,
						eatBy: leftoverBatches.eatBy
					})
					.from(plannedMeals)
					.innerJoin(leftoverBatches, eq(leftoverBatches.id, plannedMeals.leftoverBatchId))
					.where(and(eq(plannedMeals.leftoverBatchId, batchId), owned))
					.orderBy(asc(plannedMeals.date), asc(plannedMeals.slot));
				if (draws.length > 0 && !confirm) {
					return {
						ok: false,
						reason: 'has_leftovers',
						draws: draws.map((d) => ({
							entryId: d.entryId,
							date: d.date,
							slot: d.slot,
							servings: d.servings,
							pastEatBy: isPastEatBy(d.eatBy, d.date)
						}))
					};
				}
				await db.batch([
					db.delete(plannedMeals).where(and(eq(plannedMeals.leftoverBatchId, batchId), owned)),
					db
						.delete(leftoverBatches)
						.where(and(eq(leftoverBatches.id, batchId), eq(leftoverBatches.userId, userId))),
					db.delete(plannedMeals).where(and(eq(plannedMeals.id, entry.id), owned))
				]);
				return { ok: true };
			}
			await db.delete(plannedMeals).where(and(eq(plannedMeals.id, entry.id), owned));
			return { ok: true };
		},

		/** Throws a batch out: no servings stay free, and its planned leftovers show as gone. */
		async throwOut(userId: string, batchId: string): Promise<PlanResult> {
			const batch = await loadBatch(userId, batchId);
			if (!batch) return { ok: false, reason: 'not_found' };
			await db
				.update(leftoverBatches)
				.set({ thrownOutAt: new Date(), servingsRemaining: 0 })
				.where(
					and(
						eq(leftoverBatches.id, batch.id),
						eq(leftoverBatches.userId, userId),
						isNull(leftoverBatches.thrownOutAt)
					)
				);
			return { ok: true };
		}
	};
};

export type PlanStore = ReturnType<typeof makePlanStore>;

export const getPlanStore = (): PlanStore => makePlanStore(getDb());
