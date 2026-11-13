// Runs against a real Postgres: the Neon `dev` branch, through TEST_DATABASE_URL. Never production.
// Skipped when the variable is unset (CI does not set it).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';
import { DEFAULT_GOALS, dayTotals } from '$lib/domain/nutrition';
import { parseRecipeForm, type RecipeInput } from '$lib/domain/recipe-form';
import { weekDays } from '$lib/domain/plan';
import { createDb } from './db';
import {
	foodLog,
	foodUnits,
	foods,
	leftoverBatches,
	mealPlans,
	nutritionGoals,
	plannedMeals,
	recipes
} from './db/schema';
import { makeNutritionStore } from './nutrition';
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

// A week far from real data: Mon 2030-03-04 to Sun 2030-03-10.
const MON = '2030-03-04';
const TUE = '2030-03-05';
const WED = '2030-03-06';

/** A recipe whose rows are [amount, unit, name, food id]. */
const recipeInput = (title: string, servings: number, rows: [string, string, string, string][]) => {
	const data = new FormData();
	data.set('title', title);
	data.set('servings', String(servings));
	for (const [amount, unit, name, foodId] of rows) {
		data.append('ingredientRaw', '');
		data.append('ingredientAmount', amount);
		data.append('ingredientUnit', unit);
		data.append('ingredientName', name);
		data.append('ingredientNote', '');
		data.append('ingredientFoodId', foodId);
		data.append('ingredientFoodName', '');
		data.append('ingredientGrams', '');
	}
	const result = parseRecipeForm(data);
	if (!result.ok) throw new Error('test recipe is invalid');
	return result.value;
};

describe.skipIf(!url)('nutrition store (Neon dev branch)', () => {
	const db = createDb(url ?? '');
	const store = makeNutritionStore(db);
	const plan = makePlanStore(db);
	const recipeStore = makeRecipeStore(db);
	let chicken = '';
	let rice = '';
	let yogurt = '';
	let apple = '';
	let bowl = '';
	let bowlInput: RecipeInput;

	const food = async (name: string, kcal: number) => {
		const id = crypto.randomUUID();
		await db.insert(foods).values({
			id,
			userId: alice,
			name: `${name} ${run}`,
			kcalPer100g: String(kcal),
			proteinPer100g: '10',
			carbsPer100g: '10',
			fatPer100g: '1'
		});
		return id;
	};

	beforeAll(async () => {
		chicken = await food('Chicken', 165);
		rice = await food('Rice', 130);
		yogurt = await food('Yogurt', 97);
		apple = await food('Apple', 52);
		await db.insert(foodUnits).values({ foodId: apple, unit: 'each', grams: '182' });
		bowlInput = recipeInput(`Bowl ${run}`, 2, [
			['200', 'g', 'chicken', chicken],
			['100', 'g', 'rice', rice]
		]);
		bowl = await recipeStore.create(alice, bowlInput);
	});

	afterAll(async () => {
		const users = [alice, bob];
		const plans = db
			.select({ id: mealPlans.id })
			.from(mealPlans)
			.where(inArray(mealPlans.userId, users));
		await db.delete(foodLog).where(inArray(foodLog.userId, users));
		await db.delete(nutritionGoals).where(inArray(nutritionGoals.userId, users));
		await db.delete(plannedMeals).where(inArray(plannedMeals.planId, plans));
		await db.delete(leftoverBatches).where(inArray(leftoverBatches.userId, users));
		await db.delete(mealPlans).where(inArray(mealPlans.userId, users));
		await db.delete(recipes).where(inArray(recipes.userId, users));
		await db.delete(foods).where(inArray(foods.userId, users));
	});

	it('computes recipe nutrition per serving from linked rows', async () => {
		const { recipes: map } = await store.recipesNutrition(alice, [bowl]);
		expect(map.get(bowl)).toMatchObject({ counted: 2, total: 2, partial: false });
		expect(map.get(bowl)?.perServing.kcal).toBe(230);
		expect((await store.recipesNutrition(bob, [bowl])).recipes.size).toBe(0);
	});

	it('counts cooks, leftovers and food entries toward their day, live', async () => {
		const cook = await plan.addCook(alice, {
			date: MON,
			slot: 'dinner',
			recipeId: bowl,
			cooked: 4,
			eaten: 1
		});
		if (!cook.ok) throw new Error('cook failed');
		const batchId = (await plan.getWeek(alice, MON)).find((e) => e.id === cook.value)?.batchId;
		await plan.addLeftover(alice, { date: TUE, slot: 'lunch', batchId: batchId!, servings: 2 });
		await plan.addFood(alice, {
			date: MON,
			slot: 'breakfast',
			foodId: yogurt,
			newFood: null,
			amount: 170,
			unit: 'g'
		});

		const entries = await plan.getWeek(alice, MON);
		const days = dayTotals(weekDays(MON), await store.plannedNutrition(alice, entries), []);
		expect(Math.round(days[0].total.kcal)).toBe(395);
		expect(days[1].leftover.kcal).toBe(460);
		expect(days[1].planned.kcal).toBe(0);
		expect(days.some((d) => d.partial)).toBe(false);

		// Editing the recipe changes planned days on the next load.
		await recipeStore.update(alice, bowl, {
			...bowlInput,
			ingredients: [
				...bowlInput.ingredients,
				...recipeInput('x', 1, [['100', 'g', 'more rice', rice]]).ingredients
			]
		});
		const after = dayTotals(
			weekDays(MON),
			await store.plannedNutrition(alice, await plan.getWeek(alice, MON)),
			[]
		);
		expect(after[1].leftover.kcal).toBe(590);
		await recipeStore.update(alice, bowl, bowlInput);

		// Bob sees nothing of Alice's week.
		expect(await store.plannedNutrition(bob, entries)).toEqual(
			entries.map((e) => ({ date: e.date, nutrition: expect.objectContaining({ partial: true }) }))
		);
	});

	it('logs a food in its unit and a recipe with fixed numbers', async () => {
		expect(
			await store.log(alice, {
				kind: 'food',
				foodId: apple,
				amount: 1,
				unit: 'each',
				date: TUE,
				slot: null
			})
		).toEqual({ ok: true });
		expect(
			await store.log(alice, {
				kind: 'recipe',
				recipeId: bowl,
				servings: 1.5,
				date: WED,
				slot: 'dinner'
			})
		).toEqual({ ok: true });

		const logs = await store.logsForWeek(alice, MON);
		expect(logs.map((l) => [l.date, l.slot, l.label, l.macros.kcal])).toEqual([
			[TUE, null, `Apple ${run} · 1 each`, 94.64],
			[WED, 'dinner', `Bowl ${run} · 1 1/2 servings`, 345]
		]);

		// A later recipe edit does not change the log.
		await recipeStore.update(
			alice,
			bowl,
			recipeInput(`Bowl ${run}`, 1, [['500', 'g', 'rice', rice]])
		);
		expect((await store.logsForWeek(alice, MON))[1].macros.kcal).toBe(345);
		await recipeStore.update(alice, bowl, bowlInput);
	});

	it('refuses units the food does not have', async () => {
		expect(
			await store.log(alice, {
				kind: 'food',
				foodId: apple,
				amount: 1,
				unit: 'cup',
				date: MON,
				slot: null
			})
		).toEqual({ ok: false, reason: 'bad_unit' });
	});

	it("treats another user's log entry, recipe and custom food as missing", async () => {
		const [entry] = await store.logsForWeek(alice, MON);
		expect(await store.removeLog(bob, entry.id)).toBe(false);
		expect(await store.logsForWeek(bob, MON)).toEqual([]);
		expect(
			await store.log(bob, { kind: 'recipe', recipeId: bowl, servings: 1, date: MON, slot: null })
		).toEqual({ ok: false, reason: 'not_found' });
		expect(
			await store.log(bob, {
				kind: 'food',
				foodId: apple,
				amount: 1,
				unit: 'g',
				date: MON,
				slot: null
			})
		).toEqual({ ok: false, reason: 'not_found' });
		expect(await store.removeLog(alice, 'not-a-uuid')).toBe(false);
		expect((await store.logsForWeek(alice, MON)).length).toBe(2);
	});

	it('deletes an own log entry', async () => {
		const [entry] = await store.logsForWeek(alice, MON);
		expect(await store.removeLog(alice, entry.id)).toBe(true);
		expect((await store.logsForWeek(alice, MON)).map((l) => l.id)).not.toContain(entry.id);
	});

	it('keeps a log entry when its recipe is deleted', async () => {
		const temp = await recipeStore.create(
			alice,
			recipeInput(`Temp ${run}`, 1, [['100', 'g', 'rice', rice]])
		);
		await store.log(alice, { kind: 'recipe', recipeId: temp, servings: 1, date: MON, slot: null });
		expect(await recipeStore.remove(alice, temp)).toBe(true);
		const logs = await store.logsForWeek(alice, MON);
		expect(logs.find((l) => l.label.startsWith(`Temp ${run}`))?.macros.kcal).toBe(130);
	});

	it('returns default goals and saves goals per user', async () => {
		expect(await store.getGoals(alice)).toEqual(DEFAULT_GOALS);
		const goals = { kcal: 1800, proteinG: 150, carbsG: 180, fatG: 60 };
		await store.saveGoals(alice, goals);
		await store.saveGoals(alice, { ...goals, kcal: 1900 });
		expect(await store.getGoals(alice)).toEqual({ ...goals, kcal: 1900 });
		expect(await store.getGoals(bob)).toEqual(DEFAULT_GOALS);
	});
});
