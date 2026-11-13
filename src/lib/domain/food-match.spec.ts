import { describe, expect, it } from 'vitest';
import { searchStem, suggestQuery } from './food-match';

describe('searchStem', () => {
	it.each([
		['eggs', 'egg'],
		['Tomatoes', 'tomato'],
		['potatoes', 'potato'],
		['peaches', 'peach'],
		['berries', 'berr'],
		['onions', 'onion'],
		['rice', 'rice'],
		['peas', 'pea'],
		['bass', 'bass'],
		['gas', 'gas']
	])('%s → %s', (word, stem) => {
		expect(searchStem(word)).toBe(stem);
	});
});

describe('suggestQuery', () => {
	it.each([
		['1 yellow onion, diced', 'onion'],
		['Chicken breast (boneless)', 'chicken breast'],
		['freshly grated parmesan', 'parmesan'],
		['salt to taste', 'salt'],
		["baker's yeast", "baker's yeast"],
		['2 large eggs', 'eggs'],
		['  ', '']
	])('%j → %j', (name, query) => {
		expect(suggestQuery(name)).toBe(query);
	});
});
