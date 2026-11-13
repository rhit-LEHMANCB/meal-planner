import { describe, expect, it } from 'vitest';
import {
	parseLines,
	parseRecipeForm,
	recipeToFormValues,
	rowStatus,
	type IngredientRowValues,
	type RecipeFormValues
} from './recipe-form';

type Row = Partial<IngredientRowValues>;

/** Builds the FormData the browser would post, with rows as parallel lists. */
const form = (fields: Record<string, string>, rows: Row[] = []) => {
	const data = new FormData();
	for (const [k, v] of Object.entries(fields)) data.set(k, v);
	for (const row of rows) {
		data.append('ingredientRaw', row.raw ?? '');
		data.append('ingredientAmount', row.amount ?? '');
		data.append('ingredientUnit', row.unit ?? '');
		data.append('ingredientName', row.name ?? '');
		data.append('ingredientNote', row.note ?? '');
		data.append('ingredientFoodId', row.foodId ?? '');
		data.append('ingredientFoodName', row.foodName ?? '');
		data.append('ingredientGrams', row.grams ?? '');
	}
	return data;
};

/** The FormData a page would post for these form values. */
const formFromValues = (values: RecipeFormValues) => {
	const { ingredients, ...fields } = values;
	return form(fields, ingredients);
};

const valid = {
	title: 'Turkey Chili',
	servings: '6',
	totalMinutes: '55',
	sourceUrl: 'https://example.com/chili',
	steps: 'Brown the turkey.\nSimmer.'
};
const turkey: Row = { raw: '1 lb ground turkey', amount: '1', unit: 'lb', name: 'ground turkey' };
const onion: Row = { raw: '1 large onion, diced', amount: '1', name: 'large onion', note: 'diced' };

describe('parseLines', () => {
	it('trims lines, drops blanks and keeps order', () => {
		expect(parseLines('  flour \n\n eggs\r\n   \nmilk')).toEqual(['flour', 'eggs', 'milk']);
	});
});

describe('parseRecipeForm', () => {
	it('accepts a complete recipe with structured rows', () => {
		const result = parseRecipeForm(form(valid, [turkey, onion]));
		expect(result).toMatchObject({
			ok: true,
			value: {
				title: 'Turkey Chili',
				servings: 6,
				totalMinutes: 55,
				sourceUrl: 'https://example.com/chili',
				ingredients: [
					{
						rawText: '1 lb ground turkey',
						quantity: 1,
						unit: 'lb',
						name: 'ground turkey',
						note: null,
						status: 'parsed'
					},
					{
						rawText: '1 large onion, diced',
						quantity: 1,
						unit: null,
						name: 'large onion',
						note: 'diced',
						status: 'parsed'
					}
				],
				steps: ['Brown the turkey.', 'Simmer.']
			}
		});
	});

	it('accepts a recipe with only a title and servings', () => {
		const result = parseRecipeForm(form({ title: 'Toast', servings: '1' }));
		expect(result).toMatchObject({
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

	it('keeps rows in order and drops empty ones', () => {
		const result = parseRecipeForm(
			form(valid, [{ name: 'flour' }, {}, { name: 'eggs' }, { raw: 'ignored' }, { name: 'milk' }])
		);
		expect(result.ok && result.value.ingredients.map((i) => i.name)).toEqual([
			'flour',
			'eggs',
			'milk'
		]);
	});

	it('keeps the line as written when given, and rebuilds it when the editor cleared it', () => {
		const kept = {
			raw: '1 can (15 oz) kidney beans, drained',
			amount: '1',
			unit: 'can',
			name: 'kidney beans',
			note: '15 oz, drained'
		};
		const edited = { raw: '', amount: '2', unit: 'tbsp', name: 'chili powder', note: 'divided' };
		const result = parseRecipeForm(form(valid, [kept, edited]));
		expect(result.ok && result.value.ingredients.map((i) => i.rawText)).toEqual([
			'1 can (15 oz) kidney beans, drained',
			'2 tbsp chili powder, divided'
		]);
	});

	it('computes the status from the fields, never from the browser', () => {
		const data = form(valid, [
			{ amount: '2', unit: 'scoop', name: 'protein powder' },
			{ name: 'Salt', note: 'to taste' },
			{ name: 'Fresh herbs' }
		]);
		data.append('ingredientStatus', 'parsed');
		const result = parseRecipeForm(data);
		expect(result.ok && result.value.ingredients.map((i) => i.status)).toEqual([
			'check',
			'skipped',
			'check'
		]);
	});

	it('reads fractions and mixed numbers', () => {
		const result = parseRecipeForm(
			form(valid, [
				{ amount: '1 1/2', unit: 'cup', name: 'flour' },
				{ amount: '½', unit: 'tsp', name: 'salt' }
			])
		);
		expect(result.ok && result.value.ingredients.map((i) => i.quantity)).toEqual([1.5, 0.5]);
	});

	it.each(['a handful', '-1', '0', '1/0', '100000'])(
		'rejects an amount of %j next to its row',
		(amount) => {
			const result = parseRecipeForm(form(valid, [turkey, { amount, unit: 'cup', name: 'rice' }]));
			expect(result).toMatchObject({
				ok: false,
				errors: { rows: { 1: { amount: expect.stringContaining('fraction') } } }
			});
		}
	);

	it('needs a name on a row that has anything filled in', () => {
		const result = parseRecipeForm(form(valid, [{ amount: '2', unit: 'cup' }]));
		expect(result).toMatchObject({
			ok: false,
			errors: { ingredients: expect.any(String), rows: { 0: { name: expect.any(String) } } }
		});
	});

	it('limits field lengths on a row', () => {
		const result = parseRecipeForm(
			form(valid, [{ unit: 'u'.repeat(21), name: 'n'.repeat(101), note: 'x'.repeat(101) }])
		);
		expect(result).toMatchObject({
			ok: false,
			errors: {
				rows: {
					0: { unit: expect.any(String), name: expect.any(String), note: expect.any(String) }
				}
			}
		});
	});

	it('limits the number of ingredient rows and the length of steps', () => {
		const tooMany = Array.from({ length: 101 }, (_, i) => ({ name: `item ${i}` }));
		expect(parseRecipeForm(form(valid, tooMany))).toMatchObject({
			ok: false,
			errors: { ingredients: expect.stringContaining('100') }
		});
		expect(parseRecipeForm(form({ ...valid, steps: 'x'.repeat(2001) })).ok).toBe(false);
	});

	it('adds pasted lines as rows after the others', () => {
		const result = parseRecipeForm(
			form({ ...valid, pastedLines: '1 lb ground turkey\n\n2 tbsp chili powder\nSalt to taste' }, [
				{ name: 'water' }
			])
		);
		expect(
			result.ok && result.value.ingredients.map((i) => [i.quantity, i.unit, i.name, i.status])
		).toEqual([
			[null, null, 'water', 'check'],
			[1, 'lb', 'ground turkey', 'parsed'],
			[2, 'tbsp', 'chili powder', 'parsed'],
			[null, null, 'Salt', 'skipped']
		]);
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

	it('rejects a source link over 2048 characters', () => {
		const sourceUrl = `https://example.com/${'a'.repeat(2048)}`;
		expect(parseRecipeForm(form({ ...valid, sourceUrl }))).toMatchObject({
			ok: false,
			errors: { sourceUrl: expect.stringContaining('2048') }
		});
	});

	it('accepts http and https links', () => {
		for (const sourceUrl of ['http://example.com', 'https://example.com/a?b=c']) {
			expect(parseRecipeForm(form({ ...valid, sourceUrl })).ok).toBe(true);
		}
	});

	it('reports every invalid field and echoes every row as typed', () => {
		const rows = [turkey, { amount: 'lots', name: 'beans' }];
		const result = parseRecipeForm(form({ ...valid, title: '', servings: '0' }, rows));
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(Object.keys(result.errors).sort()).toEqual([
				'ingredients',
				'rows',
				'servings',
				'title'
			]);
			expect(result.values.ingredients).toMatchObject([
				{ raw: '1 lb ground turkey', amount: '1', unit: 'lb', name: 'ground turkey', note: '' },
				{ raw: '', amount: 'lots', unit: '', name: 'beans', note: '' }
			]);
		}
	});

	it('treats missing fields as empty', () => {
		expect(parseRecipeForm(form({}))).toMatchObject({ ok: false });
	});
});

describe('rowStatus', () => {
	it('follows the row as typed', () => {
		const row = { raw: '', amount: '1', unit: 'cup', name: 'rice', note: '' };
		expect(rowStatus(row)).toBe('parsed');
		expect(rowStatus({ ...row, unit: 'scoop' })).toBe('check');
		expect(rowStatus({ ...row, amount: 'some' })).toBe('check');
		expect(rowStatus({ ...row, amount: '', unit: '', name: 'salt', note: 'to taste' })).toBe(
			'skipped'
		);
	});
});

describe('recipeToFormValues', () => {
	const recipe = {
		title: 'Turkey Chili',
		servings: 6,
		totalMinutes: null,
		sourceUrl: null,
		instructions: ['one', 'two']
	};

	it('round-trips a saved recipe with structured rows unchanged', () => {
		const values = recipeToFormValues({
			...recipe,
			ingredients: [
				{
					rawText: '1 can (15 oz) beans, drained',
					quantity: 1,
					unit: 'can',
					name: 'beans',
					note: '15 oz, drained',
					status: 'parsed'
				},
				{
					rawText: '1 1/2 cups rice',
					quantity: 1.5,
					unit: 'cup',
					name: 'rice',
					note: null,
					status: 'parsed'
				}
			]
		});
		expect(values).toMatchObject({
			title: 'Turkey Chili',
			servings: '6',
			totalMinutes: '',
			sourceUrl: '',
			ingredients: [
				{
					raw: '1 can (15 oz) beans, drained',
					amount: '1',
					unit: 'can',
					name: 'beans',
					note: '15 oz, drained'
				},
				{ raw: '1 1/2 cups rice', amount: '1 1/2', unit: 'cup', name: 'rice', note: '' }
			],
			steps: 'one\ntwo'
		});

		const saved = parseRecipeForm(formFromValues(values));
		expect(saved.ok && saved.value.ingredients).toMatchObject([
			{
				rawText: '1 can (15 oz) beans, drained',
				quantity: 1,
				unit: 'can',
				name: 'beans',
				note: '15 oz, drained',
				status: 'parsed'
			},
			{
				rawText: '1 1/2 cups rice',
				quantity: 1.5,
				unit: 'cup',
				name: 'rice',
				note: null,
				status: 'parsed'
			}
		]);
	});

	it('pre-fills plain-text rows with the line parser and keeps their wording', () => {
		const values = recipeToFormValues({
			...recipe,
			ingredients: [
				{
					rawText: '1 cup rice',
					quantity: null,
					unit: null,
					name: null,
					note: null,
					status: 'unparsed'
				}
			]
		});
		expect(values.ingredients).toMatchObject([
			{ raw: '1 cup rice', amount: '1', unit: 'cup', name: 'rice', note: '' }
		]);
	});
});

describe('food links on rows', () => {
	const FOOD = '6f6b8fba-1e0c-574a-933e-6bf1249a981c';
	const cilantro: Row = { amount: '1', unit: 'bunch', name: 'cilantro', foodId: FOOD };

	it('keeps a linked food and its grams', () => {
		const r = parseRecipeForm(form(valid, [{ ...cilantro, grams: '60' }, turkey]));
		expect(r.ok && r.value.ingredients.map((i) => [i.foodId, i.grams])).toEqual([
			[FOOD, 60],
			[null, null]
		]);
	});

	it('drops grams on a row with no food', () => {
		const r = parseRecipeForm(form(valid, [{ ...turkey, grams: '60' }]));
		expect(r.ok && r.value.ingredients[0].grams).toBeNull();
	});

	it.each(['-5', '0', 'lots', '100001'])('rejects a weight of %j on the row', (grams) => {
		const r = parseRecipeForm(form(valid, [{ ...cilantro, grams }]));
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.errors.rows?.[0]?.grams).toBe('Weight must be more than 0 g, up to 100,000 g.');
			expect(r.values.ingredients[0]).toMatchObject({ foodId: FOOD, grams });
		}
	});

	it('rejects a food id that is not an id', () => {
		const r = parseRecipeForm(form(valid, [{ ...cilantro, foodId: 'nope' }]));
		expect(!r.ok && r.errors.rows?.[0]?.food).toBe('That food was not found. Pick another one.');
	});

	it('refills the form with the link from a saved row the user can see', () => {
		const values = recipeToFormValues({
			title: 'x',
			servings: 1,
			totalMinutes: null,
			sourceUrl: null,
			instructions: [],
			ingredients: [
				{
					rawText: '1 bunch cilantro',
					quantity: 1,
					unit: 'bunch',
					name: 'cilantro',
					note: null,
					status: 'parsed',
					foodId: FOOD,
					foodName: 'Coriander (cilantro) leaves, raw',
					grams: 60
				},
				{
					rawText: '1 cup rice',
					quantity: 1,
					unit: 'cup',
					name: 'rice',
					note: null,
					status: 'parsed',
					foodId: FOOD,
					foodName: null,
					grams: null
				}
			]
		});
		expect(values.ingredients.map((i) => [i.foodId, i.foodName, i.grams])).toEqual([
			[FOOD, 'Coriander (cilantro) leaves, raw', '60'],
			['', '', '']
		]);
	});
});
