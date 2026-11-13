import { describe, expect, it } from 'vitest';
import {
	parseCsvLine,
	portionUnit,
	seedSql,
	SEED_CHUNK,
	unitsForPortions,
	usdaFoodId,
	type UsdaFood,
	type UsdaPortion
} from './usda-seed';

const portion = (seq: number, modifier: string, gramWeight: number, amount = 1): UsdaPortion => ({
	fdcId: '1',
	seq,
	amount,
	modifier,
	gramWeight
});

describe('parseCsvLine', () => {
	it('splits quoted fields and keeps commas and escaped quotes', () => {
		expect(parseCsvLine('"1","Onions, raw","say ""hi""",""')).toEqual([
			'1',
			'Onions, raw',
			'say "hi"',
			''
		]);
	});
});

describe('usdaFoodId', () => {
	it('is a stable version 5 uuid', () => {
		const id = usdaFoodId('170000');
		expect(id).toBe(usdaFoodId('170000'));
		expect(id).not.toBe(usdaFoodId('170001'));
		expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
	});
});

describe('portionUnit', () => {
	it.each([
		['cup, chopped', 'cup'],
		['tablespoon', 'tbsp'],
		['tsp', 'tsp'],
		['cup slices', 'cup'],
		['medium (2-3/4" dia)', 'medium'],
		['large', 'large'],
		['slice', 'slice'],
		['fl oz', 'fl oz']
	])('%s → %s', (modifier, unit) => {
		expect(portionUnit(modifier)).toBe(unit);
	});

	it.each(['oz', 'lb', 'serving', 'NLEA serving', '', 'inch sub', '1 cup'])(
		'skips %j',
		(modifier) => {
			expect(portionUnit(modifier)).toBeNull();
		}
	);
});

describe('unitsForPortions', () => {
	it('keeps the first portion per unit and divides by the amount', () => {
		expect(
			unitsForPortions([
				portion(2, 'cup, sliced', 100),
				portion(1, 'cup, chopped', 91),
				portion(3, 'tbsp', 30, 2)
			])
		).toEqual([
			{ unit: 'cup', grams: 91 },
			{ unit: 'tbsp', grams: 15 }
		]);
	});

	it('adds each from a medium portion', () => {
		expect(unitsForPortions([portion(1, 'large', 223), portion(2, 'medium', 182)])).toEqual([
			{ unit: 'each', grams: 182 },
			{ unit: 'large', grams: 223 },
			{ unit: 'medium', grams: 182 }
		]);
	});

	it('keeps an each the food already has', () => {
		expect(unitsForPortions([portion(1, 'each', 50), portion(2, 'medium', 60)])).toEqual([
			{ unit: 'each', grams: 50 },
			{ unit: 'medium', grams: 60 }
		]);
	});

	it('drops portions with no weight', () => {
		expect(unitsForPortions([portion(1, 'cup', 0)])).toEqual([]);
	});
});

describe('seedSql', () => {
	const food = (fdcId: string, name = `Food ${fdcId}`): UsdaFood => ({
		fdcId,
		name,
		kcal: 52.004,
		protein: 0.26,
		carbs: 13.81,
		fat: 0.17
	});

	it('escapes names, rounds numbers and links units by id', () => {
		const sql = seedSql(
			[food('9', "Kellogg's, cereal")],
			new Map([['9', [{ unit: 'cup', grams: 30 }]]])
		);
		expect(sql).toContain("'Kellogg''s, cereal', 'usda', '9', 52, 0.26, 13.81, 0.17)");
		expect(sql).toContain(`'${usdaFoodId('9')}', 'cup', 30)`);
		expect(sql.split('--> statement-breakpoint')).toHaveLength(2);
	});

	it('chunks inserts and is deterministic', () => {
		const foods = Array.from({ length: SEED_CHUNK + 1 }, (_, i) => food(String(i + 1)));
		const sql = seedSql(foods, new Map());
		expect(sql.match(/INSERT INTO "foods"/g)).toHaveLength(2);
		expect(seedSql([...foods].reverse(), new Map())).toBe(sql);
	});
});
