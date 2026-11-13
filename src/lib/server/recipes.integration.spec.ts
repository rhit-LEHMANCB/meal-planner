// Runs against a real Postgres: the Neon `dev` branch, through TEST_DATABASE_URL. Never production.
// Skipped when the variable is unset (CI does not set it).
import { afterAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { parseRecipeForm, recipeToFormValues } from '$lib/domain/recipe-form';
import { createDb } from './db';
import {
	foods,
	leftoverBatches,
	mealPlans,
	plannedMeals,
	recipeIngredients,
	recipes
} from './db/schema';
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

type Overrides = Record<string, string> & { ingredients?: string };

/** A valid recipe. `ingredients` is one row per line, split by the line parser as "Paste lines" would. */
const input = (overrides: Overrides = {}) => {
	const { ingredients = 'flour\n\n  eggs  \nmilk', ...fields } = overrides;
	const data = new FormData();
	for (const [k, v] of Object.entries({
		title: 'Turkey Chili',
		servings: '6',
		totalMinutes: '55',
		sourceUrl: 'https://example.com/chili',
		steps: 'Mix.\nBake.',
		pastedLines: ingredients,
		...fields
	}))
		data.set(k, v);
	const result = parseRecipeForm(data);
	if (!result.ok) throw new Error('test input is invalid');
	return result.value;
};

const names = (recipe: Awaited<ReturnType<ReturnType<typeof makeRecipeStore>['get']>>) =>
	recipe?.ingredients.map((i) => i.rawText);

describe.skipIf(!url)('recipe store (Neon dev branch)', () => {
	const db = createDb(url ?? '');
	const store = makeRecipeStore(db);

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

	/** A recipe with one row per entry: [line, food id or '', grams or '']. */
	const linkedInput = (rows: [string, string, string][]) => {
		const data = new FormData();
		for (const [k, v] of Object.entries({ title: 'Linked', servings: '2', steps: '' }))
			data.set(k, v);
		for (const [line, foodId, grams] of rows) {
			const [amount, unit, ...name] = line.split(' ');
			data.append('ingredientRaw', '');
			data.append('ingredientAmount', amount);
			data.append('ingredientUnit', unit);
			data.append('ingredientName', name.join(' '));
			data.append('ingredientNote', '');
			data.append('ingredientFoodId', foodId);
			data.append('ingredientFoodName', '');
			data.append('ingredientGrams', grams);
		}
		const result = parseRecipeForm(data);
		if (!result.ok) throw new Error('linked input is invalid');
		return result.value;
	};

	const sharedFood = async () => {
		const [food] = await db
			.select({ id: foods.id, name: foods.name })
			.from(foods)
			.where(eq(foods.source, 'usda'))
			.limit(1);
		if (!food) throw new Error('the dev branch has no USDA foods');
		return food;
	};

	const customFood = async (owner: string, name: string) => {
		const id = crypto.randomUUID();
		await db.insert(foods).values({
			id,
			userId: owner,
			name,
			kcalPer100g: '100',
			proteinPer100g: '1',
			carbsPer100g: '1',
			fatPer100g: '1'
		});
		return id;
	};

	it('saves and reloads food links and grams, and clears them', async () => {
		const shared = await sharedFood();
		const own = await customFood(alice, `${run} own`);
		const id = await store.create(
			alice,
			linkedInput([
				['200 g chicken', shared.id, ''],
				['1 bunch cilantro', own, '60'],
				['1 cup rice', '', '']
			])
		);
		const rows = (await store.get(alice, id))!.ingredients;
		expect(rows.map((r) => [r.foodId, r.foodName, r.grams])).toEqual([
			[shared.id, shared.name, null],
			[own, `${run} own`, 60],
			[null, null, null]
		]);
		const values = recipeToFormValues((await store.get(alice, id))!);
		expect(values.ingredients[1]).toMatchObject({ foodId: own, grams: '60' });

		await store.update(alice, id, linkedInput([['200 g chicken', '', '']]));
		expect((await store.get(alice, id))!.ingredients[0]).toMatchObject({ foodId: null });
	});

	it("refuses another user's custom food and never stores the link", async () => {
		const bobs = await customFood(bob, `${run} bobs granola`);
		const recipe = linkedInput([
			['100 g granola', bobs, ''],
			['1 cup milk', '', '']
		]);
		expect(await store.foodErrors(alice, recipe)).toEqual({
			0: { food: 'That food was not found. Pick another one.' }
		});
		expect(await store.foodErrors(bob, recipe)).toEqual({});

		// Even if a route skipped the check, the save drops the link.
		const id = await store.create(alice, recipe);
		const [row] = await db
			.select({ foodId: recipeIngredients.foodId })
			.from(recipeIngredients)
			.where(eq(recipeIngredients.recipeId, id));
		expect(row.foodId).toBeNull();
	});

	it('saves ingredients and steps in the order entered and drops blank lines', async () => {
		const id = await store.create(alice, input());
		const recipe = await store.get(alice, id);

		expect(recipe).toMatchObject({
			title: 'Turkey Chili',
			servings: 6,
			totalMinutes: 55,
			sourceUrl: 'https://example.com/chili',
			instructions: ['Mix.', 'Bake.']
		});
		expect(names(recipe)).toEqual(['flour', 'eggs', 'milk']);
	});

	it('stores amount, unit, name, note and status for each row', async () => {
		const id = await store.create(
			alice,
			input({ ingredients: '1 can (15 oz) kidney beans, drained\n1 1/2 cups rice\nSalt to taste' })
		);
		expect((await store.get(alice, id))?.ingredients).toEqual([
			{
				rawText: '1 can (15 oz) kidney beans, drained',
				quantity: 1,
				unit: 'can',
				name: 'kidney beans',
				note: '15 oz, drained',
				status: 'parsed',
				foodId: null,
				foodName: null,
				grams: null
			},
			{
				rawText: '1 1/2 cups rice',
				quantity: 1.5,
				unit: 'cup',
				name: 'rice',
				note: null,
				status: 'parsed',
				foodId: null,
				foodName: null,
				grams: null
			},
			{
				rawText: 'Salt to taste',
				quantity: null,
				unit: null,
				name: 'Salt',
				note: 'to taste',
				status: 'skipped',
				foodId: null,
				foodName: null,
				grams: null
			}
		]);
	});

	it('keeps every row unchanged when an edit only changes the title', async () => {
		const id = await store.create(
			alice,
			input({ ingredients: '2 tbsp chili powder, divided\n1 lb turkey' })
		);
		const before = await store.get(alice, id);
		const values = recipeToFormValues(before!);
		const data = new FormData();
		data.set('title', 'Retitled');
		data.set('servings', values.servings);
		data.set('steps', values.steps);
		for (const row of values.ingredients) {
			data.append('ingredientRaw', row.raw);
			data.append('ingredientAmount', row.amount);
			data.append('ingredientUnit', row.unit);
			data.append('ingredientName', row.name);
			data.append('ingredientNote', row.note);
		}
		const result = parseRecipeForm(data);
		if (!result.ok) throw new Error('edit is invalid');
		await store.update(alice, id, result.value);

		const after = await store.get(alice, id);
		expect(after?.title).toBe('Retitled');
		expect(after?.ingredients).toEqual(before?.ingredients);
	});

	it("keeps a row's details when rows are reordered", async () => {
		const id = await store.create(
			alice,
			input({ ingredients: '1 lb turkey\n2 tbsp chili powder, divided' })
		);
		const [turkey, chili] = (await store.get(alice, id))!.ingredients;
		await store.update(alice, id, {
			...input(),
			ingredients: [chili, turkey].map((row) => ({
				rawText: row.rawText,
				quantity: row.quantity,
				unit: row.unit,
				name: row.name ?? '',
				note: row.note,
				foodId: row.foodId ?? null,
				grams: row.grams ?? null,
				status: row.status === 'unparsed' ? 'check' : row.status
			}))
		});
		expect((await store.get(alice, id))?.ingredients).toEqual([chili, turkey]);
	});

	it('saves a recipe with no ingredients', async () => {
		const id = await store.create(alice, input({ ingredients: '' }));
		expect((await store.get(alice, id))?.ingredients).toEqual([]);
	});

	it('lists newest first, only the owner, with ingredient counts', async () => {
		const first = await store.create(alice, input({ title: 'First' }));
		const second = await store.create(alice, input({ title: 'Second', ingredients: 'a\nb' }));
		await store.create(bob, input({ title: 'Bobs' }));

		const list = await store.list(alice);
		const ids = list.map((r) => r.id);

		expect(ids.indexOf(second)).toBeLessThan(ids.indexOf(first));
		expect(list.find((r) => r.id === second)?.ingredientCount).toBe(2);
		expect(list.some((r) => r.title === 'Bobs')).toBe(false);
	});

	it('searches titles ignoring case and treats wildcards literally', async () => {
		await store.create(alice, input({ title: 'Lemon Pasta' }));
		await store.create(alice, input({ title: '100% Beef' }));

		expect((await store.list(alice, 'lemon')).map((r) => r.title)).toContain('Lemon Pasta');
		expect((await store.list(alice, 'LEMON')).length).toBeGreaterThan(0);
		expect((await store.list(alice, 'zzz-nothing')).length).toBe(0);
		// "%" must not match every recipe.
		expect((await store.list(alice, '%')).map((r) => r.title)).toEqual(['100% Beef']);
	});

	it('edits fields and replaces ingredient lines and steps', async () => {
		const id = await store.create(alice, input());
		const ok = await store.update(
			alice,
			id,
			input({ title: 'Renamed', ingredients: 'one\ntwo', steps: 'Only step.', totalMinutes: '' })
		);

		expect(ok).toBe(true);
		expect(await store.get(alice, id)).toMatchObject({
			title: 'Renamed',
			totalMinutes: null,
			instructions: ['Only step.']
		});
		expect(names(await store.get(alice, id))).toEqual(['one', 'two']);
	});

	it('can clear every ingredient on edit', async () => {
		const id = await store.create(alice, input());
		await store.update(alice, id, input({ ingredients: '' }));
		expect((await store.get(alice, id))?.ingredients).toEqual([]);
	});

	it("never lets another user read, change or delete someone's recipe", async () => {
		const id = await store.create(alice, input({ title: 'Private' }));

		expect(await store.get(bob, id)).toBeNull();
		expect(await store.update(bob, id, input({ title: 'Hijacked' }))).toBe(false);
		expect(await store.remove(bob, id)).toBe(false);

		const own = await store.get(alice, id);
		expect(own?.title).toBe('Private');
		expect(names(own)).toEqual(['flour', 'eggs', 'milk']);
	});

	it('treats a malformed id like a missing recipe', async () => {
		expect(await store.get(alice, 'not-a-uuid')).toBeNull();
		expect(await store.update(alice, 'not-a-uuid', input())).toBe(false);
		expect(await store.remove(alice, 'not-a-uuid')).toBe(false);
	});

	it('deletes the recipe and its ingredient lines', async () => {
		const id = await store.create(alice, input());

		expect(await store.remove(alice, id)).toBe(true);
		expect(await store.get(alice, id)).toBeNull();
		const leftovers = await db
			.select({ id: recipeIngredients.id })
			.from(recipeIngredients)
			.where(eq(recipeIngredients.recipeId, id));
		expect(leftovers).toEqual([]);
	});

	it('deletes a planned recipe with its planned meals and batches, and nothing of anyone else', async () => {
		const plan = makePlanStore(db);
		const id = await store.create(alice, input());
		const other = await store.create(bob, input());
		const cook = await plan.addCook(alice, {
			date: '2030-02-04',
			slot: 'dinner',
			recipeId: id,
			cooked: 4,
			eaten: 2
		});
		if (!cook.ok) throw new Error('cook failed');
		const batchId = (await plan.getWeek(alice, '2030-02-04'))[0].batchId as string;
		await plan.addLeftover(alice, { date: '2030-02-05', slot: 'lunch', batchId, servings: 1 });
		const bobCook = await plan.addCook(bob, {
			date: '2030-02-04',
			slot: 'dinner',
			recipeId: other,
			cooked: 2,
			eaten: 1
		});

		expect((await store.get(alice, id))?.plannedCount).toBe(2);
		expect(await store.remove(alice, id)).toBe(true);
		expect(await store.get(alice, id)).toBeNull();
		expect(await plan.getWeek(alice, '2030-02-04')).toEqual([]);
		const batches = await db
			.select({ id: leftoverBatches.id })
			.from(leftoverBatches)
			.where(eq(leftoverBatches.recipeId, id));
		expect(batches).toEqual([]);
		expect((await plan.getWeek(bob, '2030-02-04')).map((e) => e.id)).toEqual([
			bobCook.ok ? bobCook.value : ''
		]);
	});
});
