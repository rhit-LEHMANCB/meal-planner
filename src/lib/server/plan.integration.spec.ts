// Runs against a real Postgres: the Neon `dev` branch, through TEST_DATABASE_URL. Never production.
// Skipped when the variable is unset (CI does not set it).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';
import { todayIso } from '$lib/domain/plan';
import { parseRecipeForm } from '$lib/domain/recipe-form';
import { createDb } from './db';
import { foods, leftoverBatches, mealPlans, plannedMeals, recipes } from './db/schema';
import { makeFoodStore } from './foods';
import { makePlanStore } from './plan';
import { makeRecipeStore } from './recipes';

try {
	process.loadEnvFile('.env');
} catch {
	// No .env file: rely on the real environment.
}

const url = process.env.TEST_DATABASE_URL;
const run = `it-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const alice = `${run}-alice`;
const bob = `${run}-bob`;

// A week far from real data: Mon 2030-01-07 to Sun 2030-01-13.
const MON = '2030-01-07';
const TUE = '2030-01-08';
const WED = '2030-01-09';
const SAT = '2030-01-12';

const recipeInput = (title: string, servings = '6') => {
	const data = new FormData();
	data.set('title', title);
	data.set('servings', servings);
	const result = parseRecipeForm(data);
	if (!result.ok) throw new Error('test recipe is invalid');
	return result.value;
};

const per100 = { kcalPer100g: 97, proteinPer100g: 9, carbsPer100g: 4, fatPer100g: 5 };

describe.skipIf(!url)('plan store (Neon dev branch)', () => {
	const db = createDb(url ?? '');
	const plan = makePlanStore(db);
	const recipeStore = makeRecipeStore(db);
	const foodStore = makeFoodStore(db);
	let chili = '';
	let bobRecipe = '';

	const free = async (batchId: string) =>
		(await plan.listBatches(alice, MON)).find((b) => b.id === batchId)?.free;

	const cook = async (date = MON, slot: 'dinner' | 'lunch' = 'dinner', cooked = 6, eaten = 2) => {
		const result = await plan.addCook(alice, { date, slot, recipeId: chili, cooked, eaten });
		if (!result.ok) throw new Error(`cook failed: ${result.reason}`);
		const entry = (await plan.getWeek(alice, MON)).find((e) => e.id === result.value);
		return { entryId: result.value, batchId: entry?.batchId as string };
	};

	beforeAll(async () => {
		chili = await recipeStore.create(alice, recipeInput(`Turkey chili ${run}`));
		bobRecipe = await recipeStore.create(bob, recipeInput(`Bob soup ${run}`));
	});

	afterAll(async () => {
		const plans = db
			.select({ id: mealPlans.id })
			.from(mealPlans)
			.where(inArray(mealPlans.userId, [alice, bob]));
		await db.delete(plannedMeals).where(inArray(plannedMeals.planId, plans));
		await db.delete(leftoverBatches).where(inArray(leftoverBatches.userId, [alice, bob]));
		await db.delete(mealPlans).where(inArray(mealPlans.userId, [alice, bob]));
		await db.delete(recipes).where(inArray(recipes.userId, [alice, bob]));
		await db.delete(foods).where(inArray(foods.userId, [alice, bob]));
	});

	it('a cook makes a batch with the spare servings free', async () => {
		const { entryId, batchId } = await cook();
		const entry = (await plan.getWeek(alice, MON)).find((e) => e.id === entryId);
		expect(entry).toMatchObject({ kind: 'cook', servings: 2, cooked: 6, drawn: 0, slot: 'dinner' });
		const batch = (await plan.listBatches(alice, MON)).find((b) => b.id === batchId);
		expect(batch).toMatchObject({
			cookedOn: MON,
			eatBy: '2030-01-11',
			spare: 4,
			free: 4,
			state: 'fridge'
		});
	});

	it('refuses another user’s recipe and keeps weeks private', async () => {
		expect(
			await plan.addCook(alice, {
				date: MON,
				slot: 'lunch',
				recipeId: bobRecipe,
				cooked: 1,
				eaten: 1
			})
		).toEqual({
			ok: false,
			reason: 'not_found'
		});
		await cook();
		expect(await plan.getWeek(bob, MON)).toEqual([]);
		expect(await plan.listBatches(bob, MON)).toEqual([]);
	});

	it('draws leftovers only after the cook and never more than free', async () => {
		const { batchId } = await cook();
		const at = (date: string, slot: 'lunch' | 'snack' | 'dinner', servings = 1) =>
			plan.addLeftover(alice, { date, slot, batchId, servings });

		expect(await at(MON, 'lunch')).toEqual({ ok: false, reason: 'before_cook' });
		expect(await at(MON, 'dinner')).toEqual({ ok: false, reason: 'before_cook' });
		expect((await at(MON, 'snack')).ok).toBe(true);
		expect((await at(TUE, 'lunch', 2)).ok).toBe(true);
		expect(await at(WED, 'lunch', 2)).toEqual({ ok: false, reason: 'not_enough', free: 1 });
		expect(await free(batchId)).toBe(1);

		const tue = (await plan.getWeek(alice, MON)).find(
			(e) => e.kind === 'leftover' && e.date === TUE
		);
		expect(tue).toMatchObject({
			title: `Turkey chili ${run}`,
			servings: 2,
			pastEatBy: false,
			gone: false
		});
	});

	it('lets only one of two simultaneous draws take the last serving', async () => {
		const { batchId } = await cook(MON, 'dinner', 3, 2);
		const results = await Promise.all([
			plan.addLeftover(alice, { date: TUE, slot: 'lunch', batchId, servings: 1 }),
			plan.addLeftover(alice, { date: WED, slot: 'lunch', batchId, servings: 1 })
		]);
		expect(results.filter((r) => r.ok)).toHaveLength(1);
		expect(await free(batchId)).toBe(0);
		const draws = (await plan.listBatches(alice, MON)).find((b) => b.id === batchId)?.draws;
		expect(draws).toHaveLength(1);
	});

	it('flags a leftover past eat-by but allows it', async () => {
		const { batchId } = await cook();
		const result = await plan.addLeftover(alice, {
			date: SAT,
			slot: 'lunch',
			batchId,
			servings: 1
		});
		expect(result.ok).toBe(true);
		const entry = (await plan.getWeek(alice, MON)).find((e) => result.ok && e.id === result.value);
		expect(entry).toMatchObject({ pastEatBy: true, eatBy: '2030-01-11' });
	});

	it('refuses draws from another user’s batch', async () => {
		const { batchId } = await cook();
		expect(await plan.addLeftover(bob, { date: TUE, slot: 'lunch', batchId, servings: 1 })).toEqual(
			{
				ok: false,
				reason: 'not_found'
			}
		);
		expect(await plan.throwOut(bob, batchId)).toEqual({ ok: false, reason: 'not_found' });
		expect(await free(batchId)).toBe(4);
	});

	it('edits a cook without dropping below what is drawn', async () => {
		const { entryId, batchId } = await cook();
		await plan.addLeftover(alice, { date: TUE, slot: 'lunch', batchId, servings: 4 });

		expect(await plan.updateEntry(alice, entryId, { kind: 'cook', cooked: 5, eaten: 2 })).toEqual({
			ok: false,
			reason: 'below_drawn',
			drawn: 4
		});
		expect(await plan.updateEntry(alice, entryId, { kind: 'cook', cooked: 8, eaten: 2 })).toEqual({
			ok: true
		});
		expect(await free(batchId)).toBe(2);
		const entry = (await plan.getWeek(alice, MON)).find((e) => e.id === entryId);
		expect(entry).toMatchObject({ cooked: 8, servings: 2, drawn: 4 });
	});

	it('edits a leftover within the batch’s free servings', async () => {
		const { batchId } = await cook();
		const added = await plan.addLeftover(alice, { date: TUE, slot: 'lunch', batchId, servings: 1 });
		if (!added.ok) throw new Error('draw failed');
		expect(await plan.updateEntry(alice, added.value, { kind: 'leftover', servings: 3 })).toEqual({
			ok: true
		});
		expect(await free(batchId)).toBe(1);
		expect(await plan.updateEntry(alice, added.value, { kind: 'leftover', servings: 5 })).toEqual({
			ok: false,
			reason: 'not_enough',
			free: 4
		});
		expect(await plan.updateEntry(bob, added.value, { kind: 'leftover', servings: 1 })).toEqual({
			ok: false,
			reason: 'not_found'
		});
	});

	it('removes a leftover and gives its servings back', async () => {
		const { batchId } = await cook();
		const added = await plan.addLeftover(alice, { date: TUE, slot: 'lunch', batchId, servings: 2 });
		if (!added.ok) throw new Error('draw failed');
		expect(await plan.removeEntry(bob, added.value)).toEqual({ ok: false, reason: 'not_found' });
		expect(await plan.removeEntry(alice, added.value)).toEqual({ ok: true });
		expect(await free(batchId)).toBe(4);
	});

	it('asks before removing a cook with planned leftovers, then removes them all', async () => {
		const { entryId, batchId } = await cook();
		const added = await plan.addLeftover(alice, { date: TUE, slot: 'lunch', batchId, servings: 1 });
		const first = await plan.removeEntry(alice, entryId);
		expect(first).toMatchObject({
			ok: false,
			reason: 'has_leftovers',
			draws: [{ date: TUE, slot: 'lunch', servings: 1 }]
		});

		expect(await plan.removeEntry(alice, entryId, true)).toEqual({ ok: true });
		const week = await plan.getWeek(alice, MON);
		expect(week.find((e) => e.id === entryId)).toBeUndefined();
		expect(week.find((e) => added.ok && e.id === added.value)).toBeUndefined();
		expect((await plan.listBatches(alice, MON)).find((b) => b.id === batchId)).toBeUndefined();
	});

	it('removes a cook with no planned leftovers at once', async () => {
		const { entryId } = await cook();
		expect(await plan.removeEntry(alice, entryId)).toEqual({ ok: true });
	});

	it('throws a batch out, keeping its planned leftovers as gone', async () => {
		const { batchId } = await cook();
		const added = await plan.addLeftover(alice, { date: TUE, slot: 'lunch', batchId, servings: 1 });
		expect(await plan.throwOut(alice, batchId)).toEqual({ ok: true });

		// Thrown out now, so "today" must be the real date for it to be in the 14-day list.
		const batch = (await plan.listBatches(alice, todayIso())).find((b) => b.id === batchId);
		expect(batch).toMatchObject({ free: 0, state: 'thrown_out', leftOn: todayIso() });
		const entry = (await plan.getWeek(alice, MON)).find((e) => added.ok && e.id === added.value);
		expect(entry).toMatchObject({ gone: true });
		expect(
			await plan.addLeftover(alice, { date: WED, slot: 'lunch', batchId, servings: 1 })
		).toEqual({
			ok: false,
			reason: 'gone'
		});
	});

	it('adds a food in a unit it has, and refuses other units and other users’ foods', async () => {
		const foodId = await foodStore.create(alice, { name: `Greek yogurt ${run}`, ...per100 });
		const ok = await plan.addFood(alice, {
			date: MON,
			slot: 'breakfast',
			foodId,
			amount: 170,
			unit: 'g'
		});
		expect(ok.ok).toBe(true);
		const entry = (await plan.getWeek(alice, MON)).find((e) => ok.ok && e.id === ok.value);
		expect(entry).toMatchObject({
			kind: 'food',
			title: `Greek yogurt ${run}`,
			amount: 170,
			unit: 'g',
			units: ['g']
		});

		expect(
			await plan.addFood(alice, { date: MON, slot: 'breakfast', foodId, amount: 1, unit: 'cup' })
		).toEqual({
			ok: false,
			reason: 'bad_unit'
		});
		expect(
			await plan.addFood(bob, { date: MON, slot: 'breakfast', foodId, amount: 1, unit: 'g' })
		).toEqual({
			ok: false,
			reason: 'not_found'
		});
		if (ok.ok) {
			expect(
				await plan.updateEntry(alice, ok.value, { kind: 'food', amount: 200, unit: 'g' })
			).toEqual({ ok: true });
			expect(await plan.removeEntry(alice, ok.value)).toEqual({ ok: true });
		}
	});

	it('keeps entries in a slot in the order added', async () => {
		const a = await cook(WED, 'dinner', 2, 2);
		const foodId = await foodStore.create(alice, { name: `Greens ${run}`, ...per100 });
		const b = await plan.addFood(alice, {
			date: WED,
			slot: 'dinner',
			foodId,
			amount: 80,
			unit: 'g'
		});
		const slot = (await plan.getWeek(alice, MON)).filter(
			(e) => e.date === WED && e.slot === 'dinner'
		);
		const ids = slot.map((e) => e.id);
		expect(ids.indexOf(a.entryId)).toBeLessThan(ids.indexOf(b.ok ? b.value : ''));
	});

	it('lists a finished batch and leaves out cooks with nothing spare', async () => {
		const { batchId } = await cook(MON, 'dinner', 3, 2);
		await plan.addLeftover(alice, { date: TUE, slot: 'lunch', batchId, servings: 1 });
		const nothingSpare = await cook(MON, 'lunch', 2, 2);

		const later = await plan.listBatches(alice, '2030-01-10');
		expect(later.find((b) => b.id === batchId)).toMatchObject({ state: 'finished', leftOn: TUE });
		expect(later.find((b) => b.id === nothingSpare.batchId)).toBeUndefined();
	});
});
