import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { userEvent } from 'vitest/browser';
import AddDialog from './AddDialog.svelte';
import type { Batch, PlanEntry } from '$lib/domain/plan';

const recipes = [
	{ id: 'r-chili', title: 'Turkey chili', servings: 6 },
	{ id: 'r-chicken', title: 'Roast chicken', servings: 4 }
];

const batch = (over: Partial<Batch>): Batch => ({
	id: 'b1',
	recipeId: 'r-chili',
	title: 'Turkey chili',
	cookedOn: '2026-10-19',
	cookSlot: 'dinner',
	eatBy: '2026-10-23',
	cooked: 6,
	eaten: 2,
	spare: 4,
	free: 3,
	thrownOutAt: null,
	draws: [],
	state: 'fridge',
	leftOn: null,
	...over
});

const batches = [
	batch({}),
	batch({ id: 'b-later', title: 'Sheet-pan salmon', cookedOn: '2026-10-21' }),
	batch({ id: 'b-empty', title: 'Lemon pasta', free: 0 })
];

const props = (over: Record<string, unknown> = {}) => ({
	target: { date: '2026-10-20', slot: 'dinner' as const },
	editing: null,
	recipes,
	batches,
	onclose: () => {},
	...over
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('AddDialog', () => {
	it('opens for the slot with Recipe, Leftover and Food tabs', async () => {
		const screen = render(AddDialog, { props: props() });
		await expect.element(screen.getByRole('heading', { name: 'Add to Tue dinner' })).toBeVisible();
		await expect
			.element(screen.getByRole('tab', { name: 'Recipe' }))
			.toHaveAttribute('aria-selected', 'true');
		await expect.element(screen.getByRole('tab', { name: 'Leftover' })).toBeVisible();
		await expect.element(screen.getByRole('tab', { name: 'Food' })).toBeVisible();
	});

	it('moves between tabs with the arrow keys', async () => {
		const screen = render(AddDialog, { props: props() });
		await screen.getByRole('tab', { name: 'Recipe' }).click();
		await userEvent.keyboard('{ArrowRight}');
		await expect
			.element(screen.getByRole('tab', { name: 'Leftover' }))
			.toHaveAttribute('aria-selected', 'true');
		await userEvent.keyboard('{ArrowLeft}{ArrowLeft}');
		await expect
			.element(screen.getByRole('tab', { name: 'Food' }))
			.toHaveAttribute('aria-selected', 'true');
	});

	it('selects a dropped recipe and fills in its servings', async () => {
		const screen = render(AddDialog, { props: props({ presetRecipeId: 'r-chicken' }) });
		await expect.element(screen.getByRole('radio', { name: /Roast chicken/ })).toBeChecked();
		await expect.element(screen.getByLabelText('Servings to cook')).toHaveValue(4);
		await expect.element(screen.getByText(/3 servings go to the fridge/)).toBeVisible();
	});

	it('offers only batches cooked before the slot with servings free', async () => {
		const screen = render(AddDialog, { props: props() });
		await screen.getByRole('tab', { name: 'Leftover' }).click();
		await expect.element(screen.getByRole('radio', { name: /Turkey chili/ })).toBeVisible();
		expect(screen.container.textContent).not.toContain('Sheet-pan salmon');
		expect(screen.container.textContent).not.toContain('Lemon pasta');
	});

	it('warns about a batch past its eat-by but still offers it', async () => {
		const screen = render(AddDialog, {
			props: props({ target: { date: '2026-10-24', slot: 'lunch' } })
		});
		await screen.getByRole('tab', { name: 'Leftover' }).click();
		await expect
			.element(screen.getByText('Past eat-by. You can still add it.').first())
			.toBeVisible();
	});

	it('offers to create a food when the search finds none', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(JSON.stringify({ foods: [] })))
		);
		const screen = render(AddDialog, { props: props() });
		await screen.getByRole('tab', { name: 'Food' }).click();
		await screen.getByLabelText('Search foods').fill('greek yogurt');
		await expect.element(screen.getByText('No foods match “greek yogurt”.')).toBeVisible();
		await screen.getByRole('button', { name: 'Create “greek yogurt”' }).click();
		await expect.element(screen.getByLabelText('Name')).toHaveValue('greek yogurt');
		await expect.element(screen.getByLabelText('kcal')).toBeVisible();
		await expect.element(screen.getByRole('button', { name: 'Create food and add' })).toBeEnabled();
	});

	it('lists found foods with their units', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response(
						JSON.stringify({
							foods: [{ id: 'f1', name: 'Apple', own: false, units: ['g', 'each'] }]
						})
					)
			)
		);
		const screen = render(AddDialog, { props: props() });
		await screen.getByRole('tab', { name: 'Food' }).click();
		await screen.getByLabelText('Search foods').fill('apple');
		await screen.getByRole('radio', { name: /Apple/ }).click();
		const options = [...screen.container.querySelectorAll('select[name="unit"] option')].map(
			(o) => o.textContent
		);
		expect(options).toEqual(['g', 'each']);
	});

	it('edits a cook with its current servings', async () => {
		const editing: PlanEntry = {
			id: 'e1',
			date: '2026-10-19',
			slot: 'dinner',
			kind: 'cook',
			title: 'Turkey chili',
			servings: 2,
			cooked: 6,
			drawn: 3,
			batchId: 'b1',
			eatBy: null,
			pastEatBy: false,
			gone: false,
			foodId: null,
			amount: null,
			unit: null,
			units: []
		};
		const screen = render(AddDialog, { props: props({ target: null, editing }) });
		await expect.element(screen.getByRole('heading', { name: 'Edit Turkey chili' })).toBeVisible();
		await expect.element(screen.getByLabelText('Servings to cook')).toHaveValue(6);
		await expect.element(screen.getByLabelText('Eaten at this meal')).toHaveValue(2);
		await expect.element(screen.getByText(/3 servings from this cook are planned/)).toBeVisible();
		expect(screen.container.querySelector('[role="tablist"]')).toBeNull();
	});

	it('closes without saving on Escape', async () => {
		const onclose = vi.fn();
		const screen = render(AddDialog, { props: props({ onclose }) });
		await expect.element(screen.getByRole('heading', { name: 'Add to Tue dinner' })).toBeVisible();
		await userEvent.keyboard('{Escape}');
		await vi.waitFor(() => expect(onclose).toHaveBeenCalled());
	});
});
