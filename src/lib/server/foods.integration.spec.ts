// Runs against a real Postgres: the Neon `dev` branch, through TEST_DATABASE_URL. Never production.
// Skipped when the variable is unset (CI does not set it).
import { afterAll, describe, expect, it } from 'vitest';
import { inArray, like } from 'drizzle-orm';
import { createDb } from './db';
import { foodUnits, foods } from './db/schema';
import { makeFoodStore, SEARCH_LIMIT } from './foods';

try {
	process.loadEnvFile('.env');
} catch {
	// No .env file: rely on the real environment.
}

const url = process.env.TEST_DATABASE_URL;
const run = `it-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const alice = `${run}-alice`;
const bob = `${run}-bob`;

const per100 = { kcalPer100g: 97, proteinPer100g: 9, carbsPer100g: 4, fatPer100g: 5 };

describe.skipIf(!url)('food store (Neon dev branch)', () => {
	const db = createDb(url ?? '');
	const store = makeFoodStore(db);

	afterAll(async () => {
		await db.delete(foods).where(inArray(foods.userId, [alice, bob]));
		// Shared test foods carry the run id in their name.
		await db.delete(foods).where(like(foods.name, `%${run}%`));
	});

	it('finds the user’s own custom food, ignoring case', async () => {
		const id = await store.create(alice, { name: `Greek yogurt ${run}`, ...per100 });
		const found = await store.search(alice, `YOGURT ${run}`);
		expect(found).toEqual([{ id, name: `Greek yogurt ${run}`, own: true, units: ['g'] }]);
		// Every word must match, in any order.
		expect((await store.search(alice, `${run} greek`)).map((f) => f.id)).toEqual([id]);
		expect(await store.search(alice, `${run} greek kale`)).toEqual([]);
	});

	it('never shows another user’s custom food', async () => {
		const id = await store.create(alice, { name: `Granola ${run}`, ...per100 });
		expect(await store.search(bob, `granola ${run}`)).toEqual([]);
		expect(await store.get(bob, id)).toBeNull();
		expect(await store.get(alice, id)).not.toBeNull();
	});

	it('shows shared foods to everyone with their units, own foods first', async () => {
		const [shared] = await db
			.insert(foods)
			.values({
				name: `Apple ${run}`,
				source: 'usda',
				kcalPer100g: '52',
				proteinPer100g: '0.3',
				carbsPer100g: '14',
				fatPer100g: '0.2'
			})
			.returning({ id: foods.id });
		await db.insert(foodUnits).values({ foodId: shared.id, unit: 'each', grams: '182' });
		const own = await store.create(bob, { name: `Apple sauce ${run}`, ...per100 });

		const found = await store.search(bob, `apple`);
		const mine = found.filter((f) => f.name.includes(run));
		expect(mine.map((f) => f.id)).toEqual([own, shared.id]);
		expect(mine[1]).toMatchObject({ own: false, units: ['g', 'each'] });
		expect((await store.get(alice, shared.id))?.units).toEqual(['g', 'each']);
	});

	it('treats LIKE wildcards literally and caps results', async () => {
		expect(await store.search(alice, '%')).toEqual(expect.any(Array));
		expect((await store.search(alice, '%')).every((f) => f.name.includes('%'))).toBe(true);
		await Promise.all(
			Array.from({ length: SEARCH_LIMIT + 3 }, (_, i) =>
				store.create(alice, { name: `Bulk ${run} ${i}`, ...per100 })
			)
		);
		expect(await store.search(alice, `bulk ${run}`)).toHaveLength(SEARCH_LIMIT);
	});

	it('returns nothing for a blank query or a malformed id', async () => {
		expect(await store.search(alice, '   ')).toEqual([]);
		expect(await store.get(alice, 'not-a-uuid')).toBeNull();
	});
});
