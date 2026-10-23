import { describe, expect, it } from 'vitest';
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
