import { describe, expect, it } from 'vitest';
import { buildGroceryList, type PlannedMeal } from './grocery';

const chili = (overrides: Partial<PlannedMeal> = {}): PlannedMeal => ({
	title: 'Turkey chili',
	servings: 6,
	recipeServings: 6,
	isLeftover: false,
	ingredients: [
		{ foodId: 'turkey', name: 'Ground turkey', grams: 454, aisle: 'Meat' },
		{ foodId: 'onion', name: 'Onion', grams: 150, aisle: 'Produce' },
		{ foodId: 'oil', name: 'Olive oil', grams: 14, aisle: 'Pantry' }
	],
	...overrides
});

describe('buildGroceryList', () => {
	it('ignores leftover meals', () => {
		const list = buildGroceryList([chili(), chili({ isLeftover: true, servings: 1 })]);
		expect(list.find((i) => i.foodId === 'turkey')?.grams).toBe(454);
	});

	it('scales ingredients to the servings being cooked', () => {
		const list = buildGroceryList([chili({ servings: 3 })]);
		expect(list.find((i) => i.foodId === 'turkey')?.grams).toBe(227);
	});

	it('merges the same food across meals and tracks which meals need it', () => {
		const tacos: PlannedMeal = {
			title: 'Fish tacos',
			servings: 2,
			recipeServings: 2,
			isLeftover: false,
			ingredients: [{ foodId: 'onion', name: 'Onion', grams: 50, aisle: 'Produce' }]
		};
		const onion = buildGroceryList([chili(), tacos]).find((i) => i.foodId === 'onion');
		expect(onion?.grams).toBe(200);
		expect(onion?.forMeals).toEqual(['Turkey chili', 'Fish tacos']);
	});

	it('skips pantry staples', () => {
		const list = buildGroceryList([chili()], new Set(['oil']));
		expect(list.map((i) => i.foodId)).not.toContain('oil');
	});

	it('sorts by aisle then name', () => {
		const names = buildGroceryList([chili()]).map((i) => i.name);
		expect(names).toEqual(['Ground turkey', 'Olive oil', 'Onion']);
	});
});
