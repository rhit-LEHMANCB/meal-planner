import { describe, expect, it } from 'vitest';
import { AISLES, aisleFor, groupByAisle, guessAisle, isAisle, type Aisle } from './aisles';

describe('guessAisle', () => {
	it.each([
		['Onion', 'Produce'],
		['Ground turkey', 'Meat and fish'],
		['Greek yogurt', 'Dairy and eggs'],
		['Tortillas', 'Bakery'],
		['Kidney beans', 'Pantry'],
		['Salt', 'Spices and oils'],
		['Frozen peas', 'Frozen']
	])('%s → %s', (name, aisle) => {
		expect(guessAisle(name)).toBe(aisle);
	});

	it('lets the longer phrase win', () => {
		expect(guessAisle('black pepper')).toBe('Spices and oils');
		expect(guessAisle('bell pepper')).toBe('Produce');
		expect(guessAisle('red pepper flakes')).toBe('Spices and oils');
		expect(guessAisle('chicken stock')).toBe('Pantry');
		expect(guessAisle('coconut milk')).toBe('Pantry');
		expect(guessAisle('garlic powder')).toBe('Spices and oils');
	});

	it('matches whole words only', () => {
		expect(guessAisle('Oilcloth')).toBe('Other');
		expect(guessAisle('Saltines')).toBe('Other');
	});

	it('ignores case and punctuation', () => {
		expect(guessAisle('ONIONS, diced')).toBe('Produce');
	});

	it('falls back to Other', () => {
		expect(guessAisle('Gochujang')).toBe('Other');
		expect(guessAisle('')).toBe('Other');
	});
});

describe('aisleFor', () => {
	const none = new Map<string, string>();

	it('prefers the remembered choice', () => {
		const choices = new Map([['gochujang', 'Pantry']]);
		expect(aisleFor('Gochujang', 'gochujang', 'Other', choices)).toBe('Pantry');
	});

	it('uses the food aisle next, when it is a known aisle', () => {
		expect(aisleFor('Apple', 'apple', 'dairy and eggs', none)).toBe('Dairy and eggs');
		expect(aisleFor('Apple', 'apple', 'Fruit stand', none)).toBe('Produce');
	});

	it('ignores a stored choice that is not an aisle', () => {
		const choices = new Map([['onion', 'Garden']]);
		expect(aisleFor('Onion', 'onion', null, choices)).toBe('Produce');
	});
});

describe('groupByAisle', () => {
	it('orders sections by aisle, drops empty ones and sorts items by name', () => {
		const items: { name: string; aisle: Aisle }[] = [
			{ name: 'Salmon', aisle: 'Meat and fish' },
			{ name: 'onion', aisle: 'Produce' },
			{ name: 'Gochujang', aisle: 'Other' },
			{ name: 'Apple', aisle: 'Produce' }
		];
		const sections = groupByAisle(items);
		expect(sections.map((s) => s.aisle)).toEqual(['Produce', 'Meat and fish', 'Other']);
		expect(sections[0].items.map((i) => i.name)).toEqual(['Apple', 'onion']);
	});
});

describe('isAisle', () => {
	it('accepts only the listed aisles', () => {
		expect(AISLES.every(isAisle)).toBe(true);
		expect(isAisle('produce')).toBe(false);
	});
});
