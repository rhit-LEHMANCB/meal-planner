import { describe, expect, it } from 'vitest';
import { macrosForGrams, perServing, sumMacros } from './nutrition';

const turkey = { kcalPer100g: 150, proteinPer100g: 20, carbsPer100g: 0, fatPer100g: 8 };

describe('nutrition', () => {
	it('scales per-100g values to the amount used', () => {
		expect(macrosForGrams(turkey, 200)).toEqual({ kcal: 300, proteinG: 40, carbsG: 0, fatG: 16 });
	});

	it('sums and divides into servings', () => {
		const total = sumMacros([macrosForGrams(turkey, 200), macrosForGrams(turkey, 100)]);
		expect(perServing(total, 3)).toEqual({ kcal: 150, proteinG: 20, carbsG: 0, fatG: 8 });
	});
});
