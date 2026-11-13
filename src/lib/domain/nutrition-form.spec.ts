import { describe, expect, it } from 'vitest';
import { parseGoalsForm, parseLogForm, parseLogId } from './nutrition-form';

const form = (fields: Record<string, string>) => {
	const data = new FormData();
	for (const [k, v] of Object.entries(fields)) data.set(k, v);
	return data;
};

const MONDAY = '2026-11-09';
const ID = '6f6b8fba-1e0c-574a-933e-6bf1249a981c';

describe('parseGoalsForm', () => {
	const goals = { kcal: '1800', proteinG: '150', carbsG: '180', fatG: '60' };

	it('accepts whole numbers in range', () => {
		expect(parseGoalsForm(form(goals))).toEqual({
			ok: true,
			value: { kcal: 1800, proteinG: 150, carbsG: 180, fatG: 60 }
		});
	});

	it.each([
		['kcal', '100'],
		['kcal', '10001'],
		['kcal', '1800.5'],
		['proteinG', '-1'],
		['fatG', '1001'],
		['carbsG', '']
	])('rejects %s = %j next to the field', (field, value) => {
		const r = parseGoalsForm(form({ ...goals, [field]: value }));
		expect(r.ok).toBe(false);
		if (!r.ok) expect(Object.keys(r.errors)).toEqual([field]);
	});

	it('names the calorie range', () => {
		const r = parseGoalsForm(form({ ...goals, kcal: '100' }));
		expect(!r.ok && r.errors.kcal).toBe('Enter whole kcal from 500 to 10,000.');
	});
});

describe('parseLogForm', () => {
	const food = {
		kind: 'food',
		date: '2026-11-10',
		slot: '',
		foodId: ID,
		amount: '1',
		unit: 'each'
	};

	it('accepts a food log with no slot', () => {
		expect(parseLogForm(form(food), MONDAY)).toEqual({
			ok: true,
			value: { kind: 'food', foodId: ID, amount: 1, unit: 'each', date: '2026-11-10', slot: null }
		});
	});

	it('accepts a recipe log with a fractional serving and a slot', () => {
		const r = parseLogForm(
			form({ kind: 'recipe', date: '2026-11-11', slot: 'dinner', recipeId: ID, servings: '1.5' }),
			MONDAY
		);
		expect(r).toEqual({
			ok: true,
			value: { kind: 'recipe', recipeId: ID, servings: 1.5, date: '2026-11-11', slot: 'dinner' }
		});
	});

	it('rejects 0 g', () => {
		const r = parseLogForm(form({ ...food, amount: '0', unit: 'g' }), MONDAY);
		expect(!r.ok && r.errors.amount).toBe('Enter an amount greater than 0.');
	});

	it('rejects a day outside the week, a bad slot and a missing food', () => {
		const r = parseLogForm(
			form({ ...food, date: '2026-11-16', slot: 'brunch', foodId: '' }),
			MONDAY
		);
		expect(!r.ok && Object.keys(r.errors).sort()).toEqual(['date', 'foodId', 'slot']);
	});

	it('rejects an unknown kind', () => {
		const r = parseLogForm(form({ ...food, kind: 'x' }), MONDAY);
		expect(!r.ok && r.errors.kind).toBe('Choose food or recipe.');
	});

	it('rejects too many servings', () => {
		const r = parseLogForm(
			form({ kind: 'recipe', date: MONDAY, slot: '', recipeId: ID, servings: '100' }),
			MONDAY
		);
		expect(!r.ok && r.errors.servings).toBeTruthy();
	});
});

describe('parseLogId', () => {
	it('accepts only a uuid', () => {
		expect(parseLogId(form({ logId: ID }))).toBe(ID);
		expect(parseLogId(form({ logId: 'nope' }))).toBeNull();
	});
});
