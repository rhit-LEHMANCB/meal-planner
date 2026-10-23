import { describe, expect, it } from 'vitest';
import { parseCookForm, parseEntryUpdate, parseFoodForm, parseLeftoverForm } from './plan-form';

const form = (fields: Record<string, string>) => {
	const data = new FormData();
	for (const [k, v] of Object.entries(fields)) data.set(k, v);
	return data;
};

const slot = { date: '2026-10-19', slot: 'dinner' };

describe('parseCookForm', () => {
	it('accepts a cook', () => {
		expect(parseCookForm(form({ ...slot, recipeId: 'r1', cooked: '6', eaten: '2' }))).toEqual({
			ok: true,
			value: { ...slot, recipeId: 'r1', cooked: 6, eaten: 2 }
		});
	});

	it('refuses eating more than is cooked', () => {
		const result = parseCookForm(form({ ...slot, recipeId: 'r1', cooked: '2', eaten: '3' }));
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.errors.eaten).toMatch(/more servings than you cook/);
	});

	it('refuses zero, fractions and too many servings', () => {
		for (const cooked of ['0', '1.5', '100', '', 'six']) {
			const result = parseCookForm(form({ ...slot, recipeId: 'r1', cooked, eaten: '1' }));
			expect(result.ok, cooked).toBe(false);
			if (!result.ok) expect(result.errors.cooked).toBeDefined();
		}
	});

	it('refuses a bad day or slot', () => {
		const result = parseCookForm(
			form({ date: '2026-02-30', slot: 'brunch', recipeId: 'r1', cooked: '1', eaten: '1' })
		);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.errors.date).toBeDefined();
			expect(result.errors.slot).toBeDefined();
		}
	});
});

describe('parseLeftoverForm', () => {
	it('accepts a leftover', () => {
		expect(parseLeftoverForm(form({ ...slot, batchId: 'b1', servings: '1' }))).toEqual({
			ok: true,
			value: { ...slot, batchId: 'b1', servings: 1 }
		});
	});

	it('needs a batch and at least one serving', () => {
		const result = parseLeftoverForm(form({ ...slot, batchId: '', servings: '0' }));
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.errors.batchId).toBeDefined();
			expect(result.errors.servings).toBeDefined();
		}
	});
});

describe('parseFoodForm', () => {
	it('accepts an existing food with an amount and unit', () => {
		expect(parseFoodForm(form({ ...slot, foodId: 'f1', amount: '170', unit: 'g' }))).toEqual({
			ok: true,
			value: { ...slot, foodId: 'f1', newFood: null, amount: 170, unit: 'g' }
		});
	});

	it('accepts decimal amounts and refuses zero', () => {
		expect(parseFoodForm(form({ ...slot, foodId: 'f1', amount: '0.5', unit: 'cup' })).ok).toBe(
			true
		);
		const zero = parseFoodForm(form({ ...slot, foodId: 'f1', amount: '0', unit: 'g' }));
		expect(zero.ok).toBe(false);
	});

	it('creates a new food with per-100 g numbers', () => {
		const result = parseFoodForm(
			form({
				...slot,
				create: '1',
				newFoodName: ' Greek yogurt ',
				kcal: '97',
				protein: '9',
				carbs: '4',
				fat: '5',
				amount: '170',
				unit: 'g'
			})
		);
		expect(result).toEqual({
			ok: true,
			value: {
				...slot,
				foodId: null,
				newFood: {
					name: 'Greek yogurt',
					kcalPer100g: 97,
					proteinPer100g: 9,
					carbsPer100g: 4,
					fatPer100g: 5
				},
				amount: 170,
				unit: 'g'
			}
		});
	});

	it('refuses negative or too-large nutrition numbers', () => {
		const result = parseFoodForm(
			form({
				...slot,
				create: '1',
				newFoodName: 'X',
				kcal: '901',
				protein: '-1',
				carbs: '4',
				fat: '101',
				amount: '1',
				unit: 'g'
			})
		);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.errors.kcal).toBeDefined();
			expect(result.errors.protein).toBeDefined();
			expect(result.errors.fat).toBeDefined();
			expect(result.errors.carbs).toBeUndefined();
		}
	});

	it('needs a food when not creating one', () => {
		const result = parseFoodForm(form({ ...slot, amount: '1', unit: 'g' }));
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.errors.foodId).toBeDefined();
	});
});

describe('parseEntryUpdate', () => {
	it('parses each kind', () => {
		expect(parseEntryUpdate(form({ entryId: 'e', kind: 'cook', cooked: '5', eaten: '1' }))).toEqual(
			{
				ok: true,
				value: { entryId: 'e', update: { kind: 'cook', cooked: 5, eaten: 1 } }
			}
		);
		expect(parseEntryUpdate(form({ entryId: 'e', kind: 'leftover', servings: '2' }))).toEqual({
			ok: true,
			value: { entryId: 'e', update: { kind: 'leftover', servings: 2 } }
		});
		expect(
			parseEntryUpdate(form({ entryId: 'e', kind: 'food', amount: '200', unit: 'g' }))
		).toEqual({
			ok: true,
			value: { entryId: 'e', update: { kind: 'food', amount: 200, unit: 'g' } }
		});
	});

	it('refuses an unknown kind or missing entry', () => {
		expect(parseEntryUpdate(form({ entryId: 'e', kind: 'other' })).ok).toBe(false);
		expect(parseEntryUpdate(form({ kind: 'cook', cooked: '1', eaten: '1' })).ok).toBe(false);
	});
});
