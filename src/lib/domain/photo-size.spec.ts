import { describe, expect, it } from 'vitest';
import { needsResize, targetSize } from './photo-size';

describe('photo sizing', () => {
	it('shrinks large or heavy photos only', () => {
		expect(needsResize(4032, 3024, 9_000_000)).toBe(true);
		expect(needsResize(1200, 900, 3_000_000)).toBe(true);
		expect(needsResize(1600, 1200, 400_000)).toBe(false);
	});

	it('keeps proportions and caps the long side at 1600 px', () => {
		expect(targetSize(4032, 3024)).toEqual({ width: 1600, height: 1200 });
		expect(targetSize(3024, 4032)).toEqual({ width: 1200, height: 1600 });
		expect(targetSize(800, 600)).toEqual({ width: 800, height: 600 });
	});
});
