import { beforeEach, describe, expect, it, vi } from 'vitest';

const usage = vi.hoisted(() => ({
	startImport: vi.fn(),
	reserveMatch: vi.fn(),
	refundMatch: vi.fn()
}));
const foods = vi.hoisted(() => ({ getMany: vi.fn(), nutritionFor: vi.fn(), search: vi.fn() }));
const match = vi.hoisted(() => vi.fn());

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$lib/server/import-usage', () => ({ getImportUsage: () => usage }));
vi.mock('$lib/server/foods', () => ({ getFoodStore: () => foods }));
vi.mock('$lib/server/ai/food-match', () => ({
	MATCH_ROWS_MAX: 100,
	makeFoodMatcher: () => ({ match })
}));

import { POST } from './+server';

const signedIn = { userID: 'alice' } as App.Locals;
const call = (body: unknown, locals = signedIn) =>
	POST({
		locals,
		request: new Request('http://x/recipes/food-match', {
			method: 'POST',
			body: JSON.stringify(body)
		})
	} as never);

const row = (fields: Record<string, unknown> = {}) => ({
	raw: '',
	amount: '1',
	unit: 'bunch',
	name: 'cilantro',
	foodId: '',
	grams: '',
	cleared: false,
	...fields
});

const cilantro = { id: 'f-cil', name: 'Coriander leaves, raw', own: false, units: ['g'] };
const rice = { id: 'f-rice', name: 'Rice', own: false, units: ['g', 'cup'] };

beforeEach(() => {
	vi.clearAllMocks();
	usage.startImport.mockResolvedValue(true);
	foods.getMany.mockResolvedValue([]);
	foods.nutritionFor.mockResolvedValue(new Map());
	match.mockResolvedValue({ status: 'matched', matches: [] });
});

describe('POST /recipes/food-match', () => {
	it('redirects signed-out visitors and matches nothing', async () => {
		await expect(call({ rows: [row()] }, {} as App.Locals)).rejects.toMatchObject({
			status: 303,
			location: '/signin'
		});
		expect(match).not.toHaveBeenCalled();
	});

	it('refuses a bad body and more than 100 rows', async () => {
		await expect(call({ nope: 1 })).rejects.toMatchObject({ status: 400 });
		await expect(call({ rows: Array.from({ length: 101 }, () => row()) })).rejects.toMatchObject({
			status: 400
		});
	});

	it('answers "none" without using the spacing when no row needs matching', async () => {
		foods.getMany.mockResolvedValue([cilantro]);
		const res = await call({
			rows: [row({ foodId: 'f-cil', grams: '40' }), row({ cleared: true })]
		});
		expect(await res.json()).toEqual({ status: 'none', rows: [] });
		expect(usage.startImport).not.toHaveBeenCalled();
		expect(match).not.toHaveBeenCalled();
	});

	it('keeps the 10 second spacing', async () => {
		usage.startImport.mockResolvedValue(false);
		const res = await call({ rows: [row()] });
		expect(res.status).toBe(429);
		expect(await res.json()).toEqual({ status: 'cooldown', rows: [] });
		expect(match).not.toHaveBeenCalled();
	});

	it('sends open rows, a linked row needing a weight, and skips cleared and weighed rows', async () => {
		foods.getMany.mockResolvedValue([cilantro, rice]);
		await call({
			rows: [
				row({ name: 'onion' }),
				row({ foodId: 'f-cil' }),
				row({ name: 'rice', amount: '2', unit: 'cup', foodId: 'f-rice' }),
				row({ name: 'parsley', cleared: true }),
				row({ foodId: 'f-cil', grams: '40', gramsSource: 'user' })
			]
		});
		const input = match.mock.calls[0][1] as { index: number; fixedFood?: unknown }[];
		expect(input.map((r) => r.index)).toEqual([0, 1]);
		expect(input[1].fixedFood).toEqual(cilantro);
	});

	it('treats a food the user cannot see as unlinked', async () => {
		foods.getMany.mockResolvedValue([]);
		const res = await call({ rows: [row({ foodId: 'someone-elses' })] });
		// Neither offered for matching (it has an id) nor trusted as a link.
		expect(await res.json()).toEqual({ status: 'none', rows: [] });
		expect(match).not.toHaveBeenCalled();
	});

	it('returns only rows that changed, with numbers for the preview', async () => {
		const onion = { id: 'f-onion', name: 'Onions, raw', units: ['g', 'each'] };
		foods.getMany.mockResolvedValue([cilantro]);
		const per100 = {
			id: 'f-onion',
			kcalPer100g: 40,
			proteinPer100g: 1,
			carbsPer100g: 9,
			fatPer100g: 0,
			units: { each: 110 }
		};
		foods.nutritionFor.mockResolvedValue(new Map([['f-onion', per100]]));
		match.mockResolvedValue({
			status: 'matched',
			matches: [
				{ index: 0, food: onion, grams: 110 },
				{ index: 1, food: cilantro, grams: 60 },
				{ index: 2, food: null, grams: null }
			]
		});
		const res = await call({
			rows: [row({ name: 'onion', unit: '' }), row({ foodId: 'f-cil' }), row({ name: 'saffron' })]
		});
		expect(await res.json()).toEqual({
			status: 'matched',
			rows: [
				{
					index: 0,
					foodId: 'f-onion',
					foodName: 'Onions, raw',
					foodMatch: 'ai',
					units: ['g', 'each'],
					nutrition: per100,
					grams: '',
					gramsSource: null
				},
				{
					index: 1,
					foodId: 'f-cil',
					foodName: 'Coriander leaves, raw',
					foodMatch: null,
					units: ['g'],
					nutrition: null,
					grams: '60',
					gramsSource: 'ai'
				}
			]
		});
	});

	it('passes the cap status through with nothing changed', async () => {
		match.mockResolvedValue({ status: 'limit', matches: [] });
		const res = await call({ rows: [row()] });
		expect(await res.json()).toEqual({ status: 'limit', rows: [] });
	});
});
