// Runs against a real Postgres: the Neon `dev` branch, through TEST_DATABASE_URL. Never production.
// Skipped when the variable is unset (CI does not set it).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import { buildGroceryList, formatAmounts, serializeAmounts } from '$lib/domain/grocery';
import { GROCERY_LIMITS } from '$lib/domain/grocery-form';
import { parseRecipeForm } from '$lib/domain/recipe-form';
import { createDb } from './db';
import {
	foods,
	groceryAisleChoices,
	groceryItems,
	groceryLists,
	leftoverBatches,
	mealPlans,
	plannedMeals,
	recipes
} from './db/schema';
import { makeFoodStore } from './foods';
import { makeGroceryStore } from './grocery';
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

// Weeks far from real data.
const MON = '2030-02-04';
const TUE = '2030-02-05';
const NEXT_MON = '2030-02-11';
const LATER_MON = '2030-02-18';
const CAP_MON = '2030-02-25';

const recipeInput = (title: string, servings: string, lines: [string, string, string][]) => {
	const data = new FormData();
	data.set('title', title);
	data.set('servings', servings);
	for (const [amount, unit, name] of lines) {
		data.append('ingredientRaw', `${amount} ${unit} ${name}`.replace(/\s+/g, ' ').trim());
		data.append('ingredientAmount', amount);
		data.append('ingredientUnit', unit);
		data.append('ingredientName', name);
		data.append('ingredientNote', '');
	}
	const result = parseRecipeForm(data);
	if (!result.ok) throw new Error(`test recipe is invalid: ${JSON.stringify(result)}`);
	return result.value;
};

const per100 = { kcalPer100g: 52, proteinPer100g: 0, carbsPer100g: 14, fatPer100g: 0 };

describe.skipIf(!url)('grocery store (Neon dev branch)', () => {
	const db = createDb(url ?? '');
	const grocery = makeGroceryStore(db);
	const plan = makePlanStore(db);
	const recipeStore = makeRecipeStore(db);
	const foodStore = makeFoodStore(db);
	let chili = '';
	let bobRecipe = '';
	let chiliCook = '';

	const list = async (userId: string, monday: string) =>
		buildGroceryList((await grocery.getWeek(userId, monday)).sources);

	beforeAll(async () => {
		chili = await recipeStore.create(
			alice,
			recipeInput(`Turkey chili ${run}`, '4', [
				['2', '', 'onion'],
				['1', 'lb', 'ground turkey'],
				['', '', 'salt']
			])
		);
		bobRecipe = await recipeStore.create(
			bob,
			recipeInput(`Bob soup ${run}`, '2', [['1', '', 'leek']])
		);

		const cook = await plan.addCook(alice, {
			date: MON,
			slot: 'dinner',
			recipeId: chili,
			cooked: 6,
			eaten: 2
		});
		if (!cook.ok) throw new Error('cook failed');
		chiliCook = cook.value;
		const batchId = (await plan.getWeek(alice, MON)).find((e) => e.id === chiliCook)?.batchId;
		const left = await plan.addLeftover(alice, {
			date: TUE,
			slot: 'lunch',
			batchId: batchId as string,
			servings: 2
		});
		if (!left.ok) throw new Error('leftover failed');
		// A leftover of the same batch in the next week: that week must stay empty.
		const nextLeft = await plan.addLeftover(alice, {
			date: NEXT_MON,
			slot: 'lunch',
			batchId: batchId as string,
			servings: 1
		});
		if (!nextLeft.ok) throw new Error('next-week leftover failed');

		const apple = await foodStore.create(alice, { name: `Apple ${run}`, ...per100 });
		for (const date of [MON, TUE]) {
			const ok = await plan.addFood(alice, {
				date,
				slot: 'snack',
				foodId: apple,
				newFood: null,
				amount: 150,
				unit: 'g'
			});
			if (!ok.ok) throw new Error('food failed');
		}
	});

	afterAll(async () => {
		const plans = db
			.select({ id: mealPlans.id })
			.from(mealPlans)
			.where(inArray(mealPlans.userId, [alice, bob]));
		await db.delete(groceryLists).where(inArray(groceryLists.planId, plans));
		await db.delete(groceryAisleChoices).where(inArray(groceryAisleChoices.userId, [alice, bob]));
		await db.delete(plannedMeals).where(inArray(plannedMeals.planId, plans));
		await db.delete(leftoverBatches).where(inArray(leftoverBatches.userId, [alice, bob]));
		await db.delete(mealPlans).where(inArray(mealPlans.userId, [alice, bob]));
		await db.delete(recipes).where(inArray(recipes.userId, [alice, bob]));
		await db.delete(foods).where(inArray(foods.userId, [alice, bob]));
	});

	it('scales cooks to servings cooked, adds foods and skips leftovers', async () => {
		const week = await grocery.getWeek(alice, MON);
		expect(week.cooks).toBe(1);
		expect(week.foods).toBe(2);
		expect(week.sources).toHaveLength(3);

		const items = buildGroceryList(week.sources);
		const byKey = new Map(items.map((i) => [i.key, i]));
		expect(formatAmounts(byKey.get('onion')!)).toBe('3');
		expect(formatAmounts(byKey.get('ground turkey')!)).toBe('1 1/2 lb');
		expect(formatAmounts(byKey.get('salt')!)).toBe('as needed');
		expect(formatAmounts(byKey.get(`apple ${run}`)!)).toBe('300 g');
		expect(byKey.get('onion')?.forMeals).toEqual([`Turkey chili ${run}`]);
		expect(byKey.get(`apple ${run}`)?.forMeals).toEqual(['Snack']);
	});

	it('gives a week of only leftovers nothing to buy', async () => {
		const week = await grocery.getWeek(alice, NEXT_MON);
		expect(week.sources).toEqual([]);
		expect(week.cooks).toBe(0);
	});

	it('shows another user nothing of the week', async () => {
		expect(await list(bob, MON)).toEqual([]);
		await grocery.setAisle(alice, 'onion', 'Frozen');
		expect((await grocery.getWeek(bob, MON)).choices.size).toBe(0);
		const added = await grocery.addExtra(alice, MON, { name: 'milk', quantity: null, unit: null });
		expect(added.ok).toBe(true);
		expect((await grocery.getWeek(bob, MON)).extras).toEqual([]);
		if (added.ok) await grocery.removeExtra(alice, added.value);
	});

	it('never reads another user’s recipe, even if a plan row points at it', async () => {
		const [aPlan] = await db
			.select({ id: mealPlans.id })
			.from(mealPlans)
			.where(and(eq(mealPlans.userId, alice), eq(mealPlans.weekStart, MON)))
			.limit(1);
		const [row] = await db
			.insert(plannedMeals)
			.values({ planId: aPlan.id, date: MON, slot: 'lunch', recipeId: bobRecipe, servings: 1 })
			.returning({ id: plannedMeals.id });
		try {
			expect((await list(alice, MON)).some((i) => i.key === 'leek')).toBe(false);
		} finally {
			await db.delete(plannedMeals).where(eq(plannedMeals.id, row.id));
		}
	});

	it('ticks idempotently, per user, and unticks', async () => {
		const onion = (await list(alice, MON)).find((i) => i.key === 'onion')!;
		const tick = { key: 'onion', name: onion.name, snapshot: serializeAmounts(onion) };
		await grocery.setTick(alice, MON, tick, ['onion']);
		await grocery.setTick(alice, MON, tick, ['onion']);
		const ticks = (await grocery.getWeek(alice, MON)).ticks;
		expect([...ticks.entries()]).toEqual([['onion', '-=3']]);
		expect((await grocery.getWeek(bob, MON)).ticks.size).toBe(0);

		// Bob unticking the same key touches nothing of Alice's.
		await grocery.setTick(bob, MON, { ...tick, snapshot: null }, []);
		expect((await grocery.getWeek(alice, MON)).ticks.size).toBe(1);

		await grocery.setTick(alice, MON, { ...tick, snapshot: null }, []);
		expect((await grocery.getWeek(alice, MON)).ticks.size).toBe(0);
	});

	it('drops ticks for items no longer on the list when ticking', async () => {
		await grocery.setTick(alice, MON, { key: 'gone', name: 'Gone', snapshot: '-=1' }, ['gone']);
		await grocery.setTick(alice, MON, { key: 'salt', name: 'Salt', snapshot: '?' }, ['salt']);
		const ticks = (await grocery.getWeek(alice, MON)).ticks;
		expect([...ticks.keys()]).toEqual(['salt']);
	});

	it('adds, ticks and removes extra items, and keeps them per user', async () => {
		const added = await grocery.addExtra(alice, LATER_MON, {
			name: 'paper towels',
			quantity: 2,
			unit: null
		});
		expect(added.ok).toBe(true);
		const id = added.ok ? added.value : '';
		expect((await grocery.getWeek(alice, LATER_MON)).extras).toEqual([
			{ id, name: 'paper towels', quantity: 2, unit: null, checked: false }
		]);

		expect(await grocery.setExtraChecked(bob, id, true)).toEqual({
			ok: false,
			reason: 'not_found'
		});
		expect(await grocery.removeExtra(bob, id)).toEqual({ ok: false, reason: 'not_found' });
		expect((await grocery.getWeek(alice, LATER_MON)).extras[0].checked).toBe(false);

		expect(await grocery.setExtraChecked(alice, id, true)).toEqual({ ok: true });
		expect((await grocery.getWeek(alice, LATER_MON)).extras[0].checked).toBe(true);
		expect(await grocery.removeExtra(alice, id)).toEqual({ ok: true });
		expect((await grocery.getWeek(alice, LATER_MON)).extras).toEqual([]);
	});

	it(`caps extra items at ${GROCERY_LIMITS.extrasPerWeek} per week`, async () => {
		const first = await grocery.addExtra(alice, CAP_MON, {
			name: 'first',
			quantity: null,
			unit: null
		});
		expect(first.ok).toBe(true);
		const [{ listId }] = await db
			.select({ listId: groceryItems.listId })
			.from(groceryItems)
			.where(eq(groceryItems.id, first.ok ? first.value : ''));
		// Fill the rest of the week straight in the table, then try one more through the store.
		await db.insert(groceryItems).values(
			Array.from({ length: GROCERY_LIMITS.extrasPerWeek - 1 }, (_, i) => ({
				listId,
				name: `extra ${i}`,
				isExtra: true
			}))
		);
		const extra = { name: 'one more', quantity: null, unit: null };
		expect(await grocery.addExtra(alice, CAP_MON, extra)).toEqual({
			ok: false,
			reason: 'too_many'
		});
		// The cap is per week: another week still takes items.
		expect((await grocery.addExtra(alice, LATER_MON, extra)).ok).toBe(true);
	});

	it('remembers aisle choices per user and updates them', async () => {
		await grocery.setAisle(alice, 'gochujang', 'Pantry');
		await grocery.setAisle(alice, 'gochujang', 'Other');
		const choices = (await grocery.getWeek(alice, LATER_MON)).choices;
		expect(choices.get('gochujang')).toBe('Other');
		expect((await grocery.getWeek(bob, LATER_MON)).choices.has('gochujang')).toBe(false);
	});
});
