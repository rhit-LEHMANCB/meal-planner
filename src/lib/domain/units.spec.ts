import { describe, expect, it } from 'vitest';
import { toGrams } from './units';

describe('toGrams', () => {
	it('converts weight units directly', () => {
		expect(toGrams(2, 'kg')).toBe(2000);
		expect(toGrams(1, 'lb')).toBeCloseTo(453.592);
	});

	it('uses the per-food conversion for volume and count units', () => {
		expect(toGrams(2, 'cup', { cup: 120 })).toBe(240);
		expect(toGrams(3, null, { each: 110 })).toBe(330);
	});

	it('returns null when the unit is unknown for the food', () => {
		expect(toGrams(1, 'pinch')).toBeNull();
	});
});
