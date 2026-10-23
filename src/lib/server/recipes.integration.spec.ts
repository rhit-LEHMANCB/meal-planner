// Runs against a real Postgres: the Neon `dev` branch, through TEST_DATABASE_URL. Never production.
// Skipped when the variable is unset (CI does not set it).
import { afterAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { parseRecipeForm } from '$lib/domain/recipe-form';
import { createDb } from './db';
import { recipeIngredients, recipes } from './db/schema';
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

const input = (overrides: Record<string, string> = {}) => {
	const result = parseRecipeForm(
		new Map(
			Object.entries({
				title: 'Turkey Chili',
				servings: '6',
				totalMinutes: '55',
				sourceUrl: 'https://example.com/chili',
				ingredients: 'flour\n\n  eggs  \nmilk',
				steps: 'Mix.\nBake.',
				...overrides
			})
		)
	);
	if (!result.ok) throw new Error('test input is invalid');
	return result.value;
};

describe.skipIf(!url)('recipe store (Neon dev branch)', () => {
	const db = createDb(url ?? '');
	const store = makeRecipeStore(db);

	afterAll(async () => {
		await db.delete(recipes).where(inArray(recipes.userId, [alice, bob]));
	});

	it('saves ingredients and steps in the order entered and drops blank lines', async () => {
		const id = await store.create(alice, input());
		const recipe = await store.get(alice, id);

		expect(recipe).toMatchObject({
			title: 'Turkey Chili',
			servings: 6,
			totalMinutes: 55,
			sourceUrl: 'https://example.com/chili',
			ingredients: ['flour', 'eggs', 'milk'],
			instructions: ['Mix.', 'Bake.']
		});
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
			ingredients: ['one', 'two'],
			instructions: ['Only step.']
		});
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

		expect(await store.get(alice, id)).toMatchObject({
			title: 'Private',
			ingredients: ['flour', 'eggs', 'milk']
		});
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
});
