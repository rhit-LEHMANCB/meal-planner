import { describe, expect, it } from 'vitest';
import {
	formatAmount,
	formatIngredientLine,
	ingredientStatus,
	normalizeUnit,
	parseAmount,
	parseIngredientLine
} from './ingredient-line';

describe('parseIngredientLine', () => {
	it.each([
		['1 lb ground turkey', 1, 'lb', 'ground turkey', null],
		['1 can (15 oz) kidney beans, drained', 1, 'can', 'kidney beans', '15 oz, drained'],
		['1 (15 oz) can kidney beans', 1, 'can', 'kidney beans', '15 oz'],
		['½ cup milk', 0.5, 'cup', 'milk', null],
		['1 1/2 cups flour', 1.5, 'cup', 'flour', null],
		['1½ tsp salt', 1.5, 'tsp', 'salt', null],
		['2-3 cloves garlic, minced', 2, 'clove', 'garlic', 'minced'],
		['1 cup rice', 1, 'cup', 'rice', null],
		['2 Tablespoons chili powder', 2, 'tbsp', 'chili powder', null],
		['1 T butter', 1, 'tbsp', 'butter', null],
		['1 t vanilla', 1, 'tsp', 'vanilla', null],
		['3 fl oz cream', 3, 'fl oz', 'cream', null],
		['250g butter', 250, 'g', 'butter', null],
		['1 cup of sugar', 1, 'cup', 'sugar', null],
		['1 large onion, diced', 1, null, 'large onion', 'diced'],
		['2 eggs', 2, null, 'eggs', null],
		['- 1 tbsp olive oil', 1, 'tbsp', 'olive oil', null],
		['.5 kg potatoes', 0.5, 'kg', 'potatoes', null]
	])('splits %j', (line, quantity, unit, name, note) => {
		expect(parseIngredientLine(line)).toEqual({ raw: line, quantity, unit, name, note });
	});

	it('pulls "to taste" into the note when there is no amount', () => {
		expect(parseIngredientLine('Salt to taste')).toEqual({
			raw: 'Salt to taste',
			quantity: null,
			unit: null,
			name: 'Salt',
			note: 'to taste'
		});
	});

	it('keeps a line it cannot read as the name', () => {
		expect(parseIngredientLine('Fresh herbs')).toMatchObject({
			quantity: null,
			name: 'Fresh herbs'
		});
		expect(parseIngredientLine('')).toMatchObject({ raw: '', name: '' });
	});
});

describe('ingredientStatus', () => {
	it.each([
		['1 lb ground turkey', 'parsed'],
		['2 eggs', 'parsed'],
		['Salt to taste', 'skipped'],
		['Parsley, for garnish', 'skipped'],
		['Fresh herbs', 'check']
	])('marks %j as %s', (line, status) => {
		expect(ingredientStatus(parseIngredientLine(line))).toBe(status);
	});

	it('asks for a check when the unit is not recognised', () => {
		expect(ingredientStatus({ quantity: 2, unit: 'scoop', name: 'protein', note: null })).toBe(
			'check'
		);
		expect(ingredientStatus({ quantity: 2, unit: 'Cups', name: 'flour', note: null })).toBe(
			'parsed'
		);
	});
});

describe('parseAmount', () => {
	it.each([
		['', null],
		['  ', null],
		['2', 2],
		['1.5', 1.5],
		['.25', 0.25],
		['1/2', 0.5],
		['1 1/2', 1.5],
		['½', 0.5],
		['1½', 1.5],
		['1/3', 0.333]
	])('reads %j as %j', (text, value) => {
		expect(parseAmount(text)).toBe(value);
	});

	it.each(['a handful', '-1', '1/0', '1,5', '2 x', 'abc'])('rejects %j', (text) => {
		expect(parseAmount(text)).toBeUndefined();
	});
});

describe('formatting', () => {
	it('shows amounts as recipe fractions', () => {
		expect(formatAmount(1.5)).toBe('1 1/2');
		expect(formatAmount(0.333)).toBe('1/3');
		expect(formatAmount(2)).toBe('2');
		expect(formatAmount(1.15)).toBe('1.15');
	});

	it.each([0.34, 0.33, 0.376, 0.004, 0.333, 1.5, 2.667, 12.125])(
		'reads %j back as exactly the same amount',
		(n) => {
			expect(parseAmount(formatAmount(n))).toBe(n);
		}
	);

	it('builds a display line from the parts', () => {
		expect(
			formatIngredientLine({ quantity: 2, unit: 'tbsp', name: 'chili powder', note: 'divided' })
		).toBe('2 tbsp chili powder, divided');
		expect(
			formatIngredientLine({ quantity: null, unit: null, name: 'Salt', note: 'to taste' })
		).toBe('Salt, to taste');
	});

	it('normalizes known units and rejects others', () => {
		expect(normalizeUnit('Tablespoons')).toBe('tbsp');
		expect(normalizeUnit('lbs.')).toBe('lb');
		expect(normalizeUnit('scoop')).toBeNull();
	});
});
