import { describe, expect, it } from 'vitest';
import { decodeEntities, htmlToPlainText } from './html-text';
import { draftToFormValues, isEmptyDraft } from './recipe-import';
import { parseDurationMinutes, parseYield, recipeFromJsonLd } from './schema-org-recipe';

const chili = {
	'@type': 'Recipe',
	name: 'Weeknight Turkey Chili',
	recipeYield: ['6', '6 bowls'],
	prepTime: 'PT15M',
	cookTime: 'PT40M',
	recipeIngredient: [
		'1 lb ground turkey',
		'1 can (15 oz) kidney beans, drained',
		'Salt to taste',
		'&frac12; cup chicken stock'
	],
	recipeInstructions: [
		{
			'@type': 'HowToSection',
			name: 'Prep',
			itemListElement: [{ '@type': 'HowToStep', text: 'Dice the onion.' }]
		},
		{ '@type': 'HowToStep', text: '<p>Brown the turkey &amp; onion.</p>' },
		'Simmer 30 minutes.'
	]
};

describe('recipeFromJsonLd', () => {
	it('maps a full recipe and splits its ingredient lines', () => {
		const draft = recipeFromJsonLd(chili, 'https://example.com/chili');
		expect(draft).toMatchObject({
			title: 'Weeknight Turkey Chili',
			servings: 6,
			totalMinutes: 55,
			sourceUrl: 'https://example.com/chili',
			steps: ['Dice the onion.', 'Brown the turkey & onion.', 'Simmer 30 minutes.']
		});
		expect(draft?.ingredients.map((i) => [i.quantity, i.unit, i.name, i.note])).toEqual([
			[1, 'lb', 'ground turkey', null],
			[1, 'can', 'kidney beans', '15 oz, drained'],
			[null, null, 'Salt', 'to taste'],
			[0.5, 'cup', 'chicken stock', null]
		]);
	});

	it('prefers totalTime and reads instructions given as one HTML string', () => {
		const draft = recipeFromJsonLd(
			{
				name: 'Soup',
				totalTime: 'PT1H5M',
				recipeInstructions: '<ol><li>Chop.</li><li>Boil.</li></ol>'
			},
			null
		);
		expect(draft).toMatchObject({ totalMinutes: 65, servings: null, steps: ['Chop.', 'Boil.'] });
	});

	it('returns null for a recipe with no title and no ingredients', () => {
		expect(recipeFromJsonLd({ '@type': 'Recipe' }, null)).toBeNull();
	});
});

describe('parsers', () => {
	it.each([
		[6, 6],
		['4 servings', 4],
		['4-6', 4],
		[['8'], 8],
		['some', null],
		[0, null],
		[2.5, null]
	])('reads yield %j as %j', (value, servings) => {
		expect(parseYield(value)).toBe(servings);
	});

	it.each([
		['PT1H30M', 90],
		['P0DT45M', 45],
		['PT90S', 2],
		['PT0M', null],
		['1 hour', null],
		[42, null]
	])('reads duration %j as %j', (value, minutes) => {
		expect(parseDurationMinutes(value)).toBe(minutes);
	});

	it('decodes entities and strips tags', () => {
		expect(decodeEntities('1&#189; cups &amp; &#x2153; &unknown;')).toBe('1½ cups & ⅓ &unknown;');
		expect(htmlToPlainText('<b>Hot</b>&nbsp;sauce<br>to taste')).toBe('Hot sauce to taste');
	});
});

describe('draftToFormValues', () => {
	it('leaves missing servings empty instead of guessing', () => {
		const values = draftToFormValues({
			title: 'Soup',
			servings: null,
			totalMinutes: null,
			sourceUrl: null,
			ingredients: [
				{ raw: '1 1/2 cups rice', quantity: 1.5, unit: 'cup', name: 'rice', note: null }
			],
			steps: ['Boil.', 'Eat.']
		});
		expect(values).toEqual({
			title: 'Soup',
			servings: '',
			totalMinutes: '',
			sourceUrl: '',
			ingredients: [
				{ raw: '1 1/2 cups rice', amount: '1 1/2', unit: 'cup', name: 'rice', note: '' }
			],
			steps: 'Boil.\nEat.'
		});
	});

	it('knows an empty draft', () => {
		const empty = {
			title: ' ',
			servings: 4,
			totalMinutes: null,
			sourceUrl: null,
			ingredients: [],
			steps: []
		};
		expect(isEmptyDraft(empty)).toBe(true);
		expect(isEmptyDraft({ ...empty, steps: ['Boil.'] })).toBe(false);
	});
});
