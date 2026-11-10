import { describe, expect, it } from 'vitest';
import {
	applyTicks,
	buildGroceryList,
	formatAmounts,
	ingredientLine,
	isCovered,
	nameKey,
	serializeAmounts,
	type GroceryLine,
	type GrocerySource
} from './grocery';

const line = (quantity: number | null, unit: string | null, name: string): GroceryLine => ({
	name,
	quantity,
	unit,
	aisle: null
});

const cook = (
	meal: string,
	cooked: number,
	serves: number,
	lines: GroceryLine[]
): GrocerySource => ({
	meal,
	scale: cooked / serves,
	lines
});

const find = (sources: GrocerySource[], name: string) =>
	buildGroceryList(sources).find((i) => i.key === nameKey(name));

describe('buildGroceryList', () => {
	it('scales a cook to the servings cooked', () => {
		const onion = find([cook('Turkey chili', 6, 4, [line(2, null, 'onion')])], 'onion');
		expect(onion?.amounts).toEqual([{ unit: null, quantity: 3 }]);
		expect(onion?.forMeals).toEqual(['Turkey chili']);
		expect(onion?.name).toBe('Onion');
	});

	it('adds the same unit and lists different units side by side', () => {
		const flour = find(
			[
				cook('Pancakes', 2, 2, [line(1, 'cup', 'Flour')]),
				cook('Veggie pizza', 2, 2, [line(1, 'cup', 'flour'), line(200, 'g', 'flour')])
			],
			'flour'
		);
		expect(flour && formatAmounts(flour)).toBe('2 cup + 200 g');
		expect(flour?.forMeals).toEqual(['Pancakes', 'Veggie pizza']);
	});

	it('matches unit spellings and name case and spacing', () => {
		const soy = find(
			[
				cook('A', 1, 1, [line(1, 'Tablespoons', 'Soy  sauce')]),
				cook('B', 1, 1, [line(2, 'tbsp', 'soy sauce')])
			],
			'soy sauce'
		);
		expect(soy && formatAmounts(soy)).toBe('3 tbsp');
	});

	it('keeps different names apart', () => {
		const list = buildGroceryList([
			cook('A', 1, 1, [line(1, null, 'onion')]),
			cook('B', 1, 1, [line(1, null, 'onions')])
		]);
		expect(list).toHaveLength(2);
	});

	it('shows "as needed" for no amount or an unscalable recipe', () => {
		const salt = find([cook('Chili', 4, 4, [line(null, null, 'salt')])], 'salt');
		expect(salt?.asNeeded).toBe(true);
		expect(salt && formatAmounts(salt)).toBe('as needed');

		const noServings = find(
			[{ meal: 'Odd', scale: null, lines: [line(2, 'cup', 'rice')] }],
			'rice'
		);
		expect(noServings && formatAmounts(noServings)).toBe('as needed');
	});

	it('shows amounts when some uses have none', () => {
		const salt = find(
			[cook('A', 1, 1, [line(1, 'tsp', 'salt')]), cook('B', 1, 1, [line(null, null, 'salt')])],
			'salt'
		);
		expect(salt && formatAmounts(salt)).toBe('1 tsp');
		expect(salt?.asNeeded).toBe(true);
	});

	it('lists each meal once', () => {
		const onion = find(
			[
				cook('Chili', 4, 4, [line(1, null, 'onion')]),
				cook('Chili', 4, 4, [line(1, null, 'onion')])
			],
			'onion'
		);
		expect(onion?.forMeals).toEqual(['Chili']);
		expect(onion?.amounts[0].quantity).toBe(2);
	});

	it('adds food entries in their unit, merging with ingredients of that name', () => {
		const apple = (aisle: string | null): GrocerySource => ({
			meal: 'Snack',
			scale: 1,
			lines: [{ name: 'Apple', quantity: 1, unit: 'each', aisle }]
		});
		const item = find(
			[apple('Produce'), apple('Produce'), cook('Pie', 1, 1, [line(2, 'each', 'apple')])],
			'apple'
		);
		expect(item && formatAmounts(item)).toBe('4 each');
		expect(item?.foodAisle).toBe('Produce');
		expect(item?.forMeals).toEqual(['Snack', 'Pie']);
	});

	it('skips lines with no name', () => {
		expect(buildGroceryList([cook('A', 1, 1, [line(2, null, '  ')])])).toEqual([]);
	});
});

describe('ingredientLine', () => {
	it('uses structured fields', () => {
		expect(ingredientLine({ rawText: 'x', name: 'onion', quantity: 2, unit: null })).toEqual(
			line(2, null, 'onion')
		);
	});

	it('parses rows saved before structured rows', () => {
		const parsed = ingredientLine({
			rawText: '2 tbsp chili powder',
			name: null,
			quantity: null,
			unit: null
		});
		expect(parsed).toMatchObject({ name: 'chili powder', quantity: 2, unit: 'tbsp' });
	});
});

describe('formatAmounts', () => {
	it('rounds count units up', () => {
		expect(formatAmounts({ amounts: [{ unit: null, quantity: 1.5 }] })).toBe('2');
		expect(formatAmounts({ amounts: [{ unit: 'can', quantity: 1.01 }] })).toBe('2 can');
		expect(formatAmounts({ amounts: [{ unit: null, quantity: 3.0000001 }] })).toBe('3');
	});

	it('keeps fractions for other units', () => {
		expect(formatAmounts({ amounts: [{ unit: 'lb', quantity: 1.5 }] })).toBe('1 1/2 lb');
	});
});

describe('ticks', () => {
	const item = (amounts: { unit: string | null; quantity: number }[], asNeeded = false) => ({
		amounts,
		asNeeded
	});

	it('serializes in a stable order', () => {
		expect(
			serializeAmounts(
				item(
					[
						{ unit: 'g', quantity: 200 },
						{ unit: 'cup', quantity: 2 }
					],
					true
				)
			)
		).toBe('cup=2;g=200;?');
		expect(serializeAmounts(item([{ unit: 'cup', quantity: 1 / 3 }]))).toBe('cup=0.333');
		// Count units are stored as shown: rounded up.
		expect(serializeAmounts(item([{ unit: null, quantity: 2.5 }]))).toBe('-=3');
	});

	it('is covered by an equal or larger tick', () => {
		const ticked = serializeAmounts(item([{ unit: null, quantity: 3 }]));
		expect(isCovered(ticked, item([{ unit: null, quantity: 3 }]))).toBe(true);
		expect(isCovered(ticked, item([{ unit: null, quantity: 2 }]))).toBe(true);
		expect(isCovered(ticked, item([{ unit: null, quantity: 3.0000001 }]))).toBe(true);
	});

	it('needs more when a unit grows or a unit is new', () => {
		const ticked = serializeAmounts(item([{ unit: null, quantity: 3 }]));
		expect(isCovered(ticked, item([{ unit: null, quantity: 4 }]))).toBe(false);
		expect(
			isCovered(
				ticked,
				item([
					{ unit: null, quantity: 3 },
					{ unit: 'g', quantity: 1 }
				])
			)
		).toBe(false);
	});

	it('survives separators in free-text units', () => {
		const odd = item([{ unit: 'can; 14 oz=big?', quantity: 1 }]);
		expect(isCovered(serializeAmounts(odd), odd)).toBe(true);
	});

	it('compares count units as shown, rounded up', () => {
		const ticked = serializeAmounts(item([{ unit: null, quantity: 2.5 }]));
		expect(isCovered(ticked, item([{ unit: null, quantity: 2.9 }]))).toBe(true);
		expect(isCovered(ticked, item([{ unit: null, quantity: 3.1 }]))).toBe(false);
		expect(isCovered('g=100', item([{ unit: 'g', quantity: 100.5 }]))).toBe(false);
	});

	it('treats "as needed" like a unit', () => {
		expect(isCovered('?', item([], true))).toBe(true);
		expect(isCovered('-=1', item([{ unit: null, quantity: 1 }], true))).toBe(false);
	});

	it('applyTicks marks checked and more needed', () => {
		const list = buildGroceryList([
			cook('Chili', 8, 4, [line(2, null, 'onion'), line(1, null, 'lime')])
		]);
		const ticks = new Map([
			['onion', '-=3'],
			['lime', '-=2']
		]);
		const [onion, lime] = applyTicks(list, ticks);
		expect(onion).toMatchObject({ key: 'onion', checked: false, moreNeeded: true });
		expect(lime).toMatchObject({ key: 'lime', checked: true, moreNeeded: false });
	});
});
