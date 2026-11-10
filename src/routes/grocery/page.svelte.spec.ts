import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { ComponentProps } from 'svelte';
import Page from './+page.svelte';
import { buildGroceryView, type GroceryWeekData } from '$lib/domain/grocery-view';

const week = (over: Partial<GroceryWeekData> = {}): GroceryWeekData => ({
	sources: [
		{
			meal: 'Turkey chili',
			scale: 1.5,
			lines: [
				{ name: 'onion', quantity: 2, unit: null, aisle: null },
				{ name: 'ground turkey', quantity: 1, unit: 'lb', aisle: null }
			]
		},
		{
			meal: 'Snack',
			scale: 1,
			lines: [{ name: 'Apple', quantity: 5, unit: 'each', aisle: null }]
		}
	],
	cooks: 1,
	foods: 1,
	ticks: new Map([['onion', '-=3']]),
	extras: [],
	choices: new Map(),
	...over
});

/** Page props; the SvelteKit-only fields the page never reads are left out. */
const props = (data: GroceryWeekData, form: unknown = null) =>
	({
		data: {
			monday: '2030-02-04',
			today: '2030-02-05',
			explicitWeek: true,
			view: buildGroceryView(data)
		},
		form
	}) as unknown as ComponentProps<typeof Page>;

describe('grocery page', () => {
	it('shows progress, what it covers and aisle sections', async () => {
		const screen = render(Page, { props: props(week()) });
		await expect
			.element(screen.getByTestId('grocery-progress'))
			.toHaveTextContent('1 of 3 in the cart');
		await expect.element(screen.getByText(/Covers 1 cook and 1 food/)).toBeVisible();
		await expect.element(screen.getByRole('region', { name: 'Produce' })).toBeVisible();
		await expect.element(screen.getByRole('region', { name: 'Meat and fish' })).toBeVisible();
		await expect
			.element(screen.getByRole('button', { name: /^Ground turkey/ }))
			.toHaveTextContent('1 1/2 lb');
		await expect.element(screen.getByText('Nothing to buy yet')).not.toBeInTheDocument();
	});

	it('shows the empty state with a link to plan the week', async () => {
		const empty = week({ sources: [], cooks: 0, foods: 0, ticks: new Map() });
		const screen = render(Page, { props: props(empty) });
		await expect.element(screen.getByText('Nothing to buy yet')).toBeVisible();
		await expect
			.element(screen.getByRole('link', { name: 'Plan this week' }))
			.toHaveAttribute('href', '/plan?week=2030-02-04');
		await expect.element(screen.getByLabelText('Add an item')).toBeVisible();
	});

	it('shows the add error next to the field', async () => {
		const screen = render(Page, {
			props: props(week(), { action: 'add', errors: { text: 'Enter an item to add.' } })
		});
		await expect.element(screen.getByText('Enter an item to add.')).toBeVisible();
		await expect
			.element(screen.getByLabelText('Add an item'))
			.toHaveAttribute('aria-invalid', 'true');
	});

	it('shows an error from a tick as a page alert', async () => {
		const screen = render(Page, {
			props: props(week(), {
				action: 'tick',
				errors: { form: 'That item is no longer on your list.' }
			})
		});
		await expect.element(screen.getByRole('alert')).toHaveTextContent('no longer on your list');
	});

	it('links the week controls to grocery weeks', async () => {
		const screen = render(Page, { props: props(week()) });
		await expect
			.element(screen.getByRole('link', { name: 'Previous week' }))
			.toHaveAttribute('href', '/grocery?week=2030-01-28');
		await expect
			.element(screen.getByRole('link', { name: 'Next week' }))
			.toHaveAttribute('href', '/grocery?week=2030-02-11');
	});
});
