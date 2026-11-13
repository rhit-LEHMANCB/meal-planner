import { describe, expect, it } from 'vitest';
import { applyMatches, searchStem, suggestQuery, type MatchableRow } from './food-match';

describe('searchStem', () => {
	it.each([
		['eggs', 'egg'],
		['Tomatoes', 'tomato'],
		['potatoes', 'potato'],
		['peaches', 'peach'],
		['berries', 'berr'],
		['onions', 'onion'],
		['rice', 'rice'],
		['peas', 'pea'],
		['bass', 'bass'],
		['gas', 'gas']
	])('%s → %s', (word, stem) => {
		expect(searchStem(word)).toBe(stem);
	});
});

describe('suggestQuery', () => {
	it.each([
		['1 yellow onion, diced', 'onion'],
		['Chicken breast (boneless)', 'chicken breast'],
		['freshly grated parmesan', 'parmesan'],
		['salt to taste', 'salt'],
		["baker's yeast", "baker's yeast"],
		['2 large eggs', 'eggs'],
		['  ', '']
	])('%j → %j', (name, query) => {
		expect(suggestQuery(name)).toBe(query);
	});
});

describe('applyMatches', () => {
	const cilantro = { id: 'cil', name: 'Coriander leaves, raw', units: ['g'] };
	const rice = { id: 'rice', name: 'Rice, white, cooked', units: ['g', 'cup'] };
	const salt = { id: 'salt', name: 'Salt, table', units: ['g', 'tsp'] };
	const row = (amount: string, unit: string, extra: Partial<MatchableRow> = {}): MatchableRow => ({
		amount,
		unit,
		foodId: '',
		foodName: '',
		grams: '',
		...extra
	});
	const noUnits = () => undefined;

	it('links a food and keeps an estimate for an amount that does not convert', () => {
		const [out] = applyMatches(
			[row('1', 'bunch')],
			[{ index: 0, food: cilantro, grams: 60 }],
			noUnits
		);
		expect(out).toMatchObject({
			foodId: 'cil',
			foodName: 'Coriander leaves, raw',
			foodMatch: 'ai',
			grams: '60',
			gramsSource: 'ai'
		});
	});

	it('keeps the conversion when the amount converts', () => {
		const [byWeight, byUnit] = applyMatches(
			[row('200', 'g'), row('2', 'cups')],
			[
				{ index: 0, food: rice, grams: 180 },
				{ index: 1, food: rice, grams: 300 }
			],
			noUnits
		);
		expect(byWeight).toMatchObject({ foodId: 'rice', grams: '' });
		expect(byWeight.gramsSource).toBeUndefined();
		expect(byUnit).toMatchObject({ foodId: 'rice', grams: '' });
	});

	it('estimates a row with no amount', () => {
		const [out] = applyMatches([row('', '')], [{ index: 0, food: salt, grams: 2 }], noUnits);
		expect(out).toMatchObject({ foodId: 'salt', grams: '2', gramsSource: 'ai' });
	});

	it.each([0, -3, 9000, Number.NaN, null])('drops an estimate of %s', (grams) => {
		const [out] = applyMatches([row('1', 'bunch')], [{ index: 0, food: cilantro, grams }], noUnits);
		expect(out).toMatchObject({ foodId: 'cil', grams: '' });
	});

	it('rounds estimates to a tenth of a gram', () => {
		const [out] = applyMatches(
			[row('1', 'bunch')],
			[{ index: 0, food: cilantro, grams: 61.234 }],
			noUnits
		);
		expect(out.grams).toBe('61.2');
	});

	it('never changes a linked food, a cleared row or a typed weight', () => {
		const rows = [
			row('1', 'bunch', { foodId: 'mine', foodName: 'My cilantro' }),
			row('1', 'bunch'),
			row('1', 'bunch', {
				foodId: 'mine',
				foodName: 'My cilantro',
				grams: '45',
				gramsSource: 'user'
			})
		];
		const matches = rows.map((_, index) => ({ index, food: cilantro, grams: 60 }));
		const [linked, cleared, weighed] = applyMatches(rows, matches, () => ['g'], new Set([1]));
		// A linked row without a weight still gets an estimate for its own food.
		expect(linked).toMatchObject({ foodId: 'mine', grams: '60', gramsSource: 'ai' });
		expect(linked.foodMatch).toBeUndefined();
		expect(cleared).toMatchObject({ foodId: '', grams: '' });
		expect(weighed).toMatchObject({ foodId: 'mine', grams: '45', gramsSource: 'user' });
	});

	it('uses the existing food’s units to decide whether a weight is needed', () => {
		const [out] = applyMatches(
			[row('2', 'cup', { foodId: 'rice', foodName: 'Rice' })],
			[{ index: 0, food: null, grams: 370 }],
			(id) => (id === 'rice' ? ['g', 'cup'] : undefined)
		);
		expect(out).toMatchObject({ foodId: 'rice', grams: '' });
	});

	it('leaves rows without a match or a food alone', () => {
		const rows = [row('1', 'pinch'), row('1', 'cup')];
		const out = applyMatches(rows, [{ index: 1, food: null, grams: 50 }], noUnits);
		expect(out).toEqual(rows);
	});
});
