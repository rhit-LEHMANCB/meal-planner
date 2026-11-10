import { describe, expect, it } from 'vitest';
import { buildGroceryView, type GroceryWeekData } from './grocery-view';

const week = (overrides: Partial<GroceryWeekData> = {}): GroceryWeekData => ({
	sources: [
		{
			meal: 'Turkey chili',
			scale: 1.5,
			lines: [
				{ name: 'onion', quantity: 2, unit: null, aisle: null },
				{ name: 'Gochujang', quantity: 2, unit: 'tbsp', aisle: null }
			]
		}
	],
	cooks: 1,
	foods: 0,
	ticks: new Map(),
	extras: [],
	choices: new Map(),
	...overrides
});

describe('buildGroceryView', () => {
	it('groups display-ready items by aisle', () => {
		const view = buildGroceryView(week());
		expect(view.sections.map((s) => s.aisle)).toEqual(['Produce', 'Other']);
		expect(view.sections[0].items[0]).toMatchObject({
			id: 'onion',
			extra: false,
			name: 'Onion',
			amount: '3',
			forText: 'Turkey chili',
			checked: false
		});
		expect(view).toMatchObject({ total: 2, done: 0, cooks: 1, empty: false });
	});

	it('applies ticks and remembered aisles', () => {
		const view = buildGroceryView(
			week({ ticks: new Map([['onion', '-=3']]), choices: new Map([['gochujang', 'Pantry']]) })
		);
		expect(view.sections.map((s) => s.aisle)).toEqual(['Produce', 'Pantry']);
		expect(view.done).toBe(1);
	});

	it('shows more needed when a tick no longer covers the item', () => {
		const view = buildGroceryView(week({ ticks: new Map([['onion', '-=2']]) }));
		expect(view.sections[0].items[0]).toMatchObject({ checked: false, moreNeeded: true });
	});

	it('adds extra items without merging them', () => {
		const view = buildGroceryView(
			week({
				extras: [
					{ id: 'x1', name: 'onion', quantity: 1, unit: null, checked: true },
					{ id: 'x2', name: 'paper towels', quantity: null, unit: null, checked: false }
				]
			})
		);
		const produce = view.sections.find((s) => s.aisle === 'Produce')!;
		expect(produce.items.map((i) => [i.id, i.forText])).toEqual([
			['onion', 'Turkey chili'],
			['x1', 'Added by you']
		]);
		const other = view.sections.find((s) => s.aisle === 'Other')!;
		expect(other.items.find((i) => i.id === 'x2')).toMatchObject({
			name: 'Paper towels',
			amount: '',
			extra: true
		});
		expect(view).toMatchObject({ total: 4, done: 1 });
	});

	it('is empty with nothing planned and no extras', () => {
		const view = buildGroceryView(week({ sources: [], cooks: 0 }));
		expect(view).toMatchObject({ empty: true, total: 0, sections: [] });
	});
});
