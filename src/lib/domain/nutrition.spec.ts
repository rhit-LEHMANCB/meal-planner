import { describe, expect, it } from 'vitest';
import {
	amountGrams,
	dayTotals,
	entryNutrition,
	goalProgress,
	ingredientGrams,
	macrosForGrams,
	perServing,
	recipeNutrition,
	sumMacros,
	unitConverts,
	weekAverage,
	type EntryForNutrition,
	type FoodNutrition,
	type IngredientForNutrition,
	type RecipeNutrition
} from './nutrition';

const turkey = { kcalPer100g: 150, proteinPer100g: 20, carbsPer100g: 0, fatPer100g: 8 };

const food = (id: string, kcal: number, units: Record<string, number> = {}): FoodNutrition => ({
	id,
	kcalPer100g: kcal,
	proteinPer100g: 10,
	carbsPer100g: 10,
	fatPer100g: 10,
	units
});

const row = (fields: Partial<IngredientForNutrition>): IngredientForNutrition => ({
	name: 'x',
	quantity: null,
	unit: null,
	foodId: null,
	grams: null,
	...fields
});

describe('macros', () => {
	it('scales per-100g values to the amount used', () => {
		expect(macrosForGrams(turkey, 200)).toEqual({ kcal: 300, proteinG: 40, carbsG: 0, fatG: 16 });
	});

	it('sums and divides into servings', () => {
		const total = sumMacros([macrosForGrams(turkey, 200), macrosForGrams(turkey, 100)]);
		expect(perServing(total, 3)).toEqual({ kcal: 150, proteinG: 20, carbsG: 0, fatG: 8 });
	});
});

describe('amount weight', () => {
	const rice = food('rice', 130, { cup: 185 });
	const onion = food('onion', 40, { each: 110 });

	it('converts weight units', () => {
		expect(amountGrams(1, 'lb', rice)).toBeCloseTo(453.6, 1);
	});

	it('uses the food unit, also when written out', () => {
		expect(amountGrams(2, 'cup', rice)).toBe(370);
		expect(amountGrams(2, 'cups', rice)).toBe(370);
	});

	it('uses each for a count with no unit', () => {
		expect(amountGrams(2, null, onion)).toBe(220);
	});

	it('is null for an unknown unit or no amount', () => {
		expect(amountGrams(1, 'bunch', rice)).toBeNull();
		expect(amountGrams(null, 'g', rice)).toBeNull();
	});

	it('falls back to the grams entered on the row', () => {
		const cilantro = food('c', 23);
		expect(ingredientGrams(row({ quantity: 1, unit: 'bunch', grams: 60 }), cilantro)).toBe(60);
		expect(ingredientGrams(row({ quantity: 1, unit: 'bunch' }), cilantro)).toBeNull();
		expect(ingredientGrams(row({ quantity: 1, unit: 'g', grams: 60 }), cilantro)).toBe(1);
	});

	it('has no weight without a food', () => {
		expect(ingredientGrams(row({ quantity: 100, unit: 'g' }), undefined)).toBeNull();
	});

	it('tells whether a unit converts for a food unit list', () => {
		expect(unitConverts('cup', ['g', 'cup'])).toBe(true);
		expect(unitConverts('tablespoons', ['g', 'tbsp'])).toBe(true);
		expect(unitConverts('oz', ['g'])).toBe(true);
		expect(unitConverts('bunch', ['g'])).toBe(false);
		expect(unitConverts(null, ['g'])).toBe(false);
		expect(unitConverts(null, ['g', 'each'])).toBe(true);
	});
});

describe('recipeNutrition', () => {
	const foods = new Map([
		['chicken', food('chicken', 165)],
		['rice', food('rice', 130)]
	]);

	it('sums linked rows per serving', () => {
		const result = recipeNutrition(
			[
				row({ quantity: 200, unit: 'g', foodId: 'chicken' }),
				row({ quantity: 100, unit: 'g', foodId: 'rice' })
			],
			foods,
			2
		);
		expect(result.perServing.kcal).toBe(230);
		expect(result).toMatchObject({ counted: 2, total: 2, partial: false });
	});

	it('is partial when rows have no food or no weight', () => {
		const rows = [
			row({ quantity: 200, unit: 'g', foodId: 'chicken' }),
			row({ quantity: 1, unit: 'pinch', foodId: 'rice' }),
			row({ quantity: 1, unit: 'pinch', name: 'saffron' })
		];
		const result = recipeNutrition(rows, foods, 1);
		expect(result.perServing.kcal).toBe(330);
		expect(result).toMatchObject({ counted: 1, total: 3, partial: true });
	});

	it('counts rows that use an AI weight estimate', () => {
		const result = recipeNutrition(
			[
				row({ quantity: 1, unit: 'bunch', foodId: 'rice', grams: 60, gramsSource: 'ai' }),
				row({ quantity: 1, unit: 'bunch', foodId: 'rice', grams: 40, gramsSource: 'user' }),
				// Converts by weight, so the stored estimate is not what counts.
				row({ quantity: 100, unit: 'g', foodId: 'rice', grams: 90, gramsSource: 'ai' })
			],
			foods,
			1
		);
		expect(result).toMatchObject({ counted: 3, estimated: 1 });
		expect(result.perServing.kcal).toBeCloseTo(130 * 2, 5);
	});

	it('ignores rows without a name', () => {
		expect(recipeNutrition([row({ name: ' ' })], foods, 1)).toMatchObject({ total: 0 });
	});

	it('has no nutrition yet when nothing is linked', () => {
		const result = recipeNutrition([row({ quantity: 1, unit: 'cup' })], foods, 4);
		expect(result.perServing.kcal).toBe(0);
		expect(result).toMatchObject({ counted: 0, total: 1, partial: true });
	});

	it('ignores foods the user cannot see', () => {
		const result = recipeNutrition([row({ quantity: 100, unit: 'g', foodId: 'other' })], foods, 1);
		expect(result).toMatchObject({ counted: 0, partial: true });
	});
});

describe('entries and days', () => {
	const recipe = (kcal: number, partial = false): RecipeNutrition => ({
		perServing: { kcal, proteinG: 0, carbsG: 0, fatG: 0 },
		counted: 1,
		total: 1,
		partial,
		estimated: 0
	});
	const recipes = new Map([
		['a', recipe(230)],
		['b', recipe(400)],
		['c', recipe(100, true)]
	]);
	const foods = new Map([['yogurt', food('yogurt', 97)]]);
	const entry = (fields: Partial<EntryForNutrition>): EntryForNutrition => ({
		date: '2026-11-09',
		kind: 'cook',
		recipeId: null,
		servings: 1,
		foodId: null,
		amount: null,
		unit: null,
		...fields
	});
	const nutrition = (e: EntryForNutrition) => ({
		date: e.date,
		nutrition: entryNutrition(e, recipes, foods)
	});

	it('counts a cook, a leftover and a food', () => {
		const entries = [
			entry({ kind: 'cook', recipeId: 'a', servings: 1 }),
			entry({ kind: 'leftover', recipeId: 'b', servings: 2 }),
			entry({ kind: 'food', foodId: 'yogurt', amount: 170, unit: 'g' })
		].map(nutrition);
		const [monday, tuesday] = dayTotals(['2026-11-09', '2026-11-10'], entries, []);
		expect(Math.round(monday.total.kcal)).toBe(1195);
		expect(monday.leftover.kcal).toBe(800);
		expect(Math.round(monday.planned.kcal)).toBe(395);
		expect(monday.partial).toBe(false);
		expect(tuesday).toMatchObject({ hasEntries: false, partial: false });
		expect(tuesday.total.kcal).toBe(0);
	});

	it('marks a day partial for a partial recipe, a missing recipe or a food without weight', () => {
		for (const e of [
			entry({ recipeId: 'c' }),
			entry({ recipeId: 'missing' }),
			entry({ kind: 'food', foodId: 'yogurt', amount: 1, unit: 'cup' })
		]) {
			expect(dayTotals(['2026-11-09'], [nutrition(e)], [])[0].partial).toBe(true);
		}
	});

	it('adds logged entries as their own part', () => {
		const logs = [{ date: '2026-11-09', macros: { kcal: 95, proteinG: 0, carbsG: 0, fatG: 0 } }];
		const [day] = dayTotals(['2026-11-09'], [], logs);
		expect(day).toMatchObject({ hasEntries: true });
		expect(day.logged.kcal).toBe(95);
		expect(day.total.kcal).toBe(95);
	});

	it('averages only days with entries', () => {
		const logs = [
			{ date: '2026-11-09', macros: { kcal: 1800, proteinG: 100, carbsG: 0, fatG: 0 } },
			{ date: '2026-11-10', macros: { kcal: 2200, proteinG: 120, carbsG: 0, fatG: 0 } }
		];
		const days = dayTotals(['2026-11-09', '2026-11-10', '2026-11-11'], [], logs);
		expect(weekAverage(days)).toEqual({ kcal: 2000, proteinG: 110, carbsG: 0, fatG: 0 });
		expect(weekAverage(dayTotals(['2026-11-09'], [], []))).toBeNull();
	});
});

describe('goalProgress', () => {
	it('shows what is left', () => {
		expect(goalProgress(1540.4, 2000)).toEqual({
			value: 1540,
			goal: 2000,
			left: 460,
			over: 0,
			percent: 77
		});
	});

	it('shows what is over and caps the bar', () => {
		expect(goalProgress(2300, 2000)).toMatchObject({ left: 0, over: 300, percent: 100 });
	});

	it('handles a zero goal', () => {
		expect(goalProgress(10, 0)).toMatchObject({ percent: 0, over: 10 });
	});
});
