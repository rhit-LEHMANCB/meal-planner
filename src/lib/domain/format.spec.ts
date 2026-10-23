import { describe, expect, it } from 'vitest';
import { formatMinutes, formatServings, hostname } from './format';

describe('format', () => {
	it('formats minutes', () => {
		expect(formatMinutes(55)).toBe('55 min');
		expect(formatMinutes(60)).toBe('1 h');
		expect(formatMinutes(90)).toBe('1 h 30 min');
		expect(formatMinutes(125)).toBe('2 h 5 min');
	});

	it('pluralizes servings', () => {
		expect(formatServings(1)).toBe('1 serving');
		expect(formatServings(6)).toBe('6 servings');
	});

	it('extracts a display host from web links only', () => {
		expect(hostname('https://www.example.com/a/b')).toBe('example.com');
		expect(hostname('http://recipes.example.org')).toBe('recipes.example.org');
		expect(hostname(null)).toBeNull();
		expect(hostname('javascript:alert(1)')).toBeNull();
		expect(hostname('nonsense')).toBeNull();
	});
});
