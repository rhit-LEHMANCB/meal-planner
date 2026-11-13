import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import IngredientRows from './IngredientRows.svelte';

const rows = [
	{ raw: '1 lb ground turkey', amount: '1', unit: 'lb', name: 'ground turkey', note: '' },
	{ raw: '2 tbsp chili powder', amount: '2', unit: 'tbsp', name: 'chili powder', note: '' }
];

const names = (screen: ReturnType<typeof render>) =>
	[...screen.container.querySelectorAll<HTMLInputElement>('input[name="ingredientName"]')].map(
		(input) => input.value
	);

describe('IngredientRows', () => {
	it('moves a row and keeps its details', async () => {
		const screen = render(IngredientRows, { rows });
		await screen.getByRole('button', { name: 'Move row 2 up' }).click();
		expect(names(screen)).toEqual(['chili powder', 'ground turkey', '']);
		await expect.element(screen.getByLabelText('Amount, row 1')).toHaveValue('2');
		await expect.element(screen.getByLabelText('Unit, row 1')).toHaveValue('tbsp');
	});

	it('removes a row and adds an empty one', async () => {
		const screen = render(IngredientRows, { rows });
		await screen.getByRole('button', { name: 'Remove row 1' }).click();
		expect(names(screen)).toEqual(['chili powder', '']);
		await screen.getByRole('button', { name: 'Add ingredient' }).click();
		expect(names(screen)).toEqual(['chili powder', '', '']);
	});

	it('turns pasted lines into parsed rows after the existing ones', async () => {
		const screen = render(IngredientRows, { rows });
		await screen.getByLabelText('Paste ingredient lines').fill('1 cup rice\nSalt to taste');
		await screen.getByRole('button', { name: 'Add lines' }).click();
		expect(names(screen)).toEqual(['ground turkey', 'chili powder', 'rice', 'Salt', '']);
		await expect.element(screen.getByLabelText('Unit, row 3')).toHaveValue('cup');
		await expect.element(screen.getByLabelText('Paste ingredient lines')).toHaveValue('');
		const chips = [...screen.container.querySelectorAll('[data-status]')].map((el) =>
			el.getAttribute('data-status')
		);
		expect(chips).toEqual(['parsed', 'parsed', 'parsed', 'skipped']);
	});

	it('updates the chip and drops the line as written when a field is edited', async () => {
		const screen = render(IngredientRows, { rows });
		const hidden = () =>
			screen.container.querySelectorAll<HTMLInputElement>('input[name="ingredientRaw"]')[0].value;
		expect(hidden()).toBe('1 lb ground turkey');
		await screen.getByLabelText('Unit, row 1').fill('scoop');
		expect(hidden()).toBe('');
		await expect
			.element(screen.container.querySelector<HTMLElement>('[data-row="1"] [data-status]'))
			.toHaveTextContent('Check');
	});
});

describe('IngredientRows with nutrition', () => {
	const onion = { id: 'f-onion', name: 'Onions, raw', own: false, units: ['g', 'each', 'cup'] };
	const cilantro = { id: 'f-cil', name: 'Coriander leaves, raw', own: false, units: ['g'] };

	/** Answers suggestion and search requests; records the URLs asked for. */
	const stubFetch = (
		suggestions: unknown[] = [],
		foods: unknown[] = [],
		search: unknown[] = []
	) => {
		const calls: string[] = [];
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string) => {
				calls.push(url);
				const body = url.includes('food-suggestions') ? { suggestions, foods } : { foods: search };
				return new Response(JSON.stringify(body), { status: 200 });
			})
		);
		return calls;
	};

	const posted = (screen: ReturnType<typeof render>, name: string) =>
		[...screen.container.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`)].map(
			(input) => input.value
		);

	afterEach(() => vi.unstubAllGlobals());

	const onionRow = { raw: '1 onion', amount: '1', unit: '', name: 'yellow onion', note: '' };

	it('shows a suggestion but posts no food until it is used', async () => {
		const calls = stubFetch([onion]);
		const screen = render(IngredientRows, { rows: [onionRow], nutrition: true });
		await expect.element(screen.getByText('Onions, raw')).toBeVisible();
		expect(calls[0]).toContain('name=yellow+onion');
		expect(posted(screen, 'ingredientFoodId')).toEqual(['', '']);

		await screen.getByRole('button', { name: 'Use suggested food, row 1' }).click();
		expect(posted(screen, 'ingredientFoodId')).toEqual(['f-onion', '']);
		expect(posted(screen, 'ingredientFoodName')[0]).toBe('Onions, raw');
		// "1 onion" with an each unit converts, so no grams are asked for.
		expect(screen.container.querySelector('input[id^="grams-"]')).toBeNull();
		expect(posted(screen, 'ingredientGrams')).toEqual(['', '']);
	});

	it('dismisses a suggestion for good', async () => {
		stubFetch([onion]);
		const screen = render(IngredientRows, { rows: [onionRow], nutrition: true });
		await screen.getByRole('button', { name: 'Dismiss suggested food, row 1' }).click();
		await expect
			.element(screen.getByText('No food linked, so it adds no nutrition.'))
			.toBeVisible();
		expect(posted(screen, 'ingredientFoodId')).toEqual(['', '']);
	});

	it('asks for grams only when the amount does not convert for the food', async () => {
		stubFetch([], [cilantro]);
		const screen = render(IngredientRows, {
			rows: [
				{
					raw: '',
					amount: '1',
					unit: 'bunch',
					name: 'cilantro',
					note: '',
					foodId: 'f-cil',
					foodName: cilantro.name
				},
				{
					raw: '',
					amount: '200',
					unit: 'g',
					name: 'rice',
					note: '',
					foodId: 'f-rice',
					foodName: 'Rice'
				}
			],
			nutrition: true,
			foodUnits: { 'f-cil': ['g'], 'f-rice': ['g'] }
		});
		await expect.element(screen.getByLabelText('About how many grams?')).toBeVisible();
		expect(screen.container.querySelectorAll('input[id^="grams-"]')).toHaveLength(1);
		await screen.getByLabelText('About how many grams?').fill('60');
		expect(posted(screen, 'ingredientGrams')).toEqual(['60', '', '']);
	});

	it('links a food found by search and clears it again', async () => {
		stubFetch([null], [], [onion]);
		const screen = render(IngredientRows, { rows: [onionRow], nutrition: true });
		await screen.getByRole('button', { name: 'Match food, row 1' }).click();
		await expect
			.element(screen.getByLabelText('Find a food for row 1'))
			.toHaveValue('yellow onion');
		await screen.getByRole('button', { name: 'Search' }).click();
		await screen.getByRole('button', { name: 'Onions, raw' }).click();
		expect(posted(screen, 'ingredientFoodId')[0]).toBe('f-onion');
		await screen.getByRole('button', { name: 'Clear food, row 1' }).click();
		expect(posted(screen, 'ingredientFoodId')[0]).toBe('');
	});

	it('shows no food controls or fields without nutrition (import review)', async () => {
		const calls = stubFetch([onion]);
		const screen = render(IngredientRows, { rows: [onionRow] });
		expect(screen.container.querySelector('[data-food]')).toBeNull();
		expect(posted(screen, 'ingredientFoodId')).toEqual([]);
		expect(calls).toEqual([]);
	});
});
