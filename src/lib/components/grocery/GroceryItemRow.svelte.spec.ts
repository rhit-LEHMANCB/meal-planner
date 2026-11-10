import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import GroceryItemRow from './GroceryItemRow.svelte';
import type { ViewItem } from '$lib/domain/grocery-view';

const item = (over: Partial<ViewItem> = {}): ViewItem => ({
	id: 'onion',
	extra: false,
	key: 'onion',
	name: 'Onion',
	amount: '3',
	forText: 'Turkey chili, Roast chicken',
	checked: false,
	moreNeeded: false,
	aisle: 'Produce',
	...over
});

const WEEK = '2026-11-09';

const hidden = (form: HTMLFormElement, name: string) =>
	(form.querySelector(`input[name="${name}"]`) as HTMLInputElement | null)?.value;

const formOf = (el: Element) => el.closest('form') as HTMLFormElement;

describe('GroceryItemRow', () => {
	it('shows an unticked derived item whose button ticks it', async () => {
		const screen = render(GroceryItemRow, { props: { item: item(), week: WEEK } });
		const tick = screen.getByRole('button', { name: /^Onion/, pressed: false });
		await expect.element(tick).toHaveTextContent('Turkey chili, Roast chicken');
		await expect.element(tick).toHaveTextContent('3');
		const form = formOf(tick.element());
		expect(form.getAttribute('action')).toBe('?/tick');
		expect(hidden(form, 'key')).toBe('onion');
		expect(hidden(form, 'checked')).toBe('true');
		expect(hidden(form, 'week')).toBe(WEEK);
		await expect
			.element(screen.getByText('More needed since you ticked it'))
			.not.toBeInTheDocument();
	});

	it('shows a ticked item whose button unticks it', async () => {
		const screen = render(GroceryItemRow, { props: { item: item({ checked: true }), week: WEEK } });
		const tick = screen.getByRole('button', { name: /^Onion/, pressed: true });
		expect(hidden(formOf(tick.element()), 'checked')).toBe('false');
		await expect
			.element(screen.getByText('Onion', { exact: true }).first())
			.toHaveClass('line-through');
	});

	it('flags an item that needs more since it was ticked', async () => {
		const screen = render(GroceryItemRow, {
			props: { item: item({ moreNeeded: true }), week: WEEK }
		});
		await expect
			.element(screen.getByRole('button', { name: /^Onion/, pressed: false }))
			.toBeVisible();
		await expect.element(screen.getByText('More needed since you ticked it')).toBeVisible();
	});

	it('ticks extra items by id and offers Delete for them', async () => {
		const extra = item({
			id: '6f1c1a52-6d0f-4d38-9a5c-2b0e7d0f8a11',
			extra: true,
			key: 'paper towels',
			name: 'Paper towels',
			amount: '2',
			forText: 'Added by you',
			aisle: 'Other'
		});
		const screen = render(GroceryItemRow, { props: { item: extra, week: WEEK } });
		const form = formOf(screen.getByRole('button', { name: /^Paper towels/ }).element());
		expect(form.getAttribute('action')).toBe('?/extraTick');
		expect(hidden(form, 'id')).toBe(extra.id);

		await screen.getByRole('button', { name: 'More for Paper towels' }).click();
		await expect.element(screen.getByRole('dialog', { name: 'Paper towels' })).toBeVisible();
		await expect.element(screen.getByRole('button', { name: 'Delete item' })).toBeVisible();
		await expect.element(screen.getByRole('radio', { name: 'Other' })).toBeChecked();
	});

	it('opens a menu with the aisle radios and no Delete for derived items', async () => {
		const screen = render(GroceryItemRow, { props: { item: item(), week: WEEK } });
		await screen.getByRole('button', { name: 'More for Onion' }).click();
		const menu = screen.getByRole('dialog', { name: 'Onion' });
		await expect.element(menu).toBeVisible();
		await expect.element(menu).toHaveTextContent('3 · for Turkey chili, Roast chicken');
		await expect.element(screen.getByRole('radio', { name: 'Produce' })).toBeChecked();
		expect(screen.getByRole('radio').elements()).toHaveLength(8);
		await expect
			.element(screen.getByRole('button', { name: 'Delete item' }))
			.not.toBeInTheDocument();
		const form = formOf(screen.getByRole('button', { name: 'Move' }).element());
		expect(form.getAttribute('action')).toBe('?/aisle');
		expect(hidden(form, 'key')).toBe('onion');
	});
});
