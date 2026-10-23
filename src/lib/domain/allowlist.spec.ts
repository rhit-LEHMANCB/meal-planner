import { describe, expect, it } from 'vitest';
import { isAllowed, parseAllowlist } from './allowlist';

describe('parseAllowlist', () => {
	it('splits on commas, trims and lower-cases', () => {
		expect(parseAllowlist(' Cook@Example.com ,b@example.com,, ')).toEqual([
			'cook@example.com',
			'b@example.com'
		]);
	});

	it('treats missing or empty values as an empty list', () => {
		expect(parseAllowlist(undefined)).toEqual([]);
		expect(parseAllowlist('')).toEqual([]);
	});
});

describe('isAllowed', () => {
	const list = parseAllowlist('Cook@Example.com,b@example.com');

	it('matches ignoring case and surrounding spaces', () => {
		expect(isAllowed('cook@example.com', list)).toBe(true);
		expect(isAllowed('  COOK@EXAMPLE.COM ', list)).toBe(true);
	});

	it('rejects addresses that are not on the list', () => {
		expect(isAllowed('stranger@example.com', list)).toBe(false);
		expect(isAllowed('cook@example.com.evil.test', list)).toBe(false);
	});

	it('rejects everyone when the list is empty', () => {
		expect(isAllowed('cook@example.com', [])).toBe(false);
	});

	it('rejects missing emails', () => {
		expect(isAllowed(undefined, list)).toBe(false);
		expect(isAllowed('', list)).toBe(false);
	});
});
