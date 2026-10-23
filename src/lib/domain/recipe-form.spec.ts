import { describe, expect, it } from 'vitest';
import { parseLines, parseRecipeForm, recipeToFormValues } from './recipe-form';

const form = (fields: Record<string, string>) => new Map(Object.entries(fields));

const valid = {
	title: 'Turkey Chili',
	servings: '6',
	totalMinutes: '55',
	sourceUrl: 'https://example.com/chili',
	ingredients: '1 lb turkey\n1 onion',
	steps: 'Brown the turkey.\nSimmer.'
};

describe('parseLines', () => {
	it('trims lines, drops blanks and keeps order', () => {
		expect(parseLines('  flour \n\n eggs\r\n   \nmilk')).toEqual(['flour', 'eggs', 'milk']);
	});
});

describe('parseRecipeForm', () => {
	it('accepts a complete recipe', () => {
		const result = parseRecipeForm(form(valid));
		expect(result).toEqual({
			ok: true,
			value: {
				title: 'Turkey Chili',
				servings: 6,
				totalMinutes: 55,
				sourceUrl: 'https://example.com/chili',
				ingredients: ['1 lb turkey', '1 onion'],
				steps: ['Brown the turkey.', 'Simmer.']
			}
		});
	});

	it('accepts a recipe with only a title and servings', () => {
		const result = parseRecipeForm(form({ title: 'Toast', servings: '1' }));
		expect(result).toEqual({
			ok: true,
			value: {
				title: 'Toast',
				servings: 1,
				totalMinutes: null,
				sourceUrl: null,
				ingredients: [],
				steps: []
			}
		});
	});

	it('requires a title', () => {
		for (const title of ['', '   ']) {
			const result = parseRecipeForm(form({ ...valid, title }));
			expect(result).toMatchObject({ ok: false, errors: { title: 'Title is required.' } });
		}
	});

	it('rejects a title over 200 characters', () => {
		const result = parseRecipeForm(form({ ...valid, title: 'x'.repeat(201) }));
		expect(result).toMatchObject({ ok: false, errors: { title: expect.stringContaining('200') } });
	});

	it.each(['0', '-2', '1.5', 'six', '', '100'])('rejects servings of %j', (servings) => {
		const result = parseRecipeForm(form({ ...valid, servings }));
		expect(result).toMatchObject({
			ok: false,
			errors: { servings: expect.stringContaining('whole number') }
		});
	});

	it.each(['0', 'abc', '2.5', '1441'])('rejects total time of %j', (totalMinutes) => {
		const result = parseRecipeForm(form({ ...valid, totalMinutes }));
		expect(result).toMatchObject({ ok: false, errors: { totalMinutes: expect.any(String) } });
	});

	it.each(['example.com/chili', 'ftp://example.com', 'javascript:alert(1)', 'not a url'])(
		'rejects source link %j',
		(sourceUrl) => {
			const result = parseRecipeForm(form({ ...valid, sourceUrl }));
			expect(result).toMatchObject({
				ok: false,
				errors: { sourceUrl: expect.stringContaining('http') }
			});
		}
	);

	it('accepts http and https links', () => {
		for (const sourceUrl of ['http://example.com', 'https://example.com/a?b=c']) {
			expect(parseRecipeForm(form({ ...valid, sourceUrl })).ok).toBe(true);
		}
	});

	it('limits the number and length of ingredient and step lines', () => {
		const tooMany = Array.from({ length: 101 }, (_, i) => `item ${i}`).join('\n');
		expect(parseRecipeForm(form({ ...valid, ingredients: tooMany })).ok).toBe(false);
		expect(parseRecipeForm(form({ ...valid, ingredients: 'x'.repeat(301) })).ok).toBe(false);
		expect(parseRecipeForm(form({ ...valid, steps: 'x'.repeat(2001) })).ok).toBe(false);
	});

	it('reports every invalid field and echoes what was typed', () => {
		const result = parseRecipeForm(form({ ...valid, title: '', servings: '0' }));
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(Object.keys(result.errors).sort()).toEqual(['servings', 'title']);
			expect(result.values.ingredients).toBe('1 lb turkey\n1 onion');
		}
	});

	it('treats missing fields as empty', () => {
		expect(parseRecipeForm(form({}))).toMatchObject({ ok: false });
	});
});

describe('recipeToFormValues', () => {
	it('round-trips a saved recipe', () => {
		const values = recipeToFormValues({
			title: 'Turkey Chili',
			servings: 6,
			totalMinutes: null,
			sourceUrl: null,
			ingredients: ['a', 'b'],
			instructions: ['one', 'two']
		});
		expect(values).toEqual({
			title: 'Turkey Chili',
			servings: '6',
			totalMinutes: '',
			sourceUrl: '',
			ingredients: 'a\nb',
			steps: 'one\ntwo'
		});
		expect(parseRecipeForm(form(values))).toMatchObject({ ok: true });
	});
});
