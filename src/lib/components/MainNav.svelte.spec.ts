import { afterEach, describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import MainNav from './MainNav.svelte';
// The breakpoint classes decide which nav shows, so the spec needs the app's Tailwind CSS.
import '../../routes/layout.css';

const props = { pathname: '/grocery', email: 'cook@example.test' };

afterEach(async () => {
	await page.viewport(414, 896);
});

describe('MainNav on a phone', () => {
	it('shows a Menu button instead of the sidebar', async () => {
		await page.viewport(390, 844);
		const screen = render(MainNav, { props });
		await expect.element(screen.getByRole('button', { name: 'Menu' })).toBeVisible();
		await expect
			.element(screen.getByRole('link', { name: 'Plan', exact: true }))
			.not.toBeInTheDocument();
		expect(screen.getByRole('navigation', { name: 'Main' }).elements()).toHaveLength(0);
	});

	it('opens the links, marks the current page and closes again', async () => {
		await page.viewport(390, 844);
		const screen = render(MainNav, { props });
		await screen.getByRole('button', { name: 'Menu' }).click();

		const nav = screen.getByRole('navigation', { name: 'Main' });
		await expect.element(nav).toBeVisible();
		await expect
			.element(nav.getByRole('link', { name: 'Grocery list' }))
			.toHaveAttribute('aria-current', 'page');
		await expect
			.element(nav.getByRole('link', { name: 'Plan', exact: true }))
			.not.toHaveAttribute('aria-current');
		await expect.element(nav.getByText('cook@example.test')).toBeVisible();
		await expect.element(nav.getByRole('button', { name: 'Sign out' })).toBeVisible();

		await screen.getByRole('button', { name: 'Close menu' }).click();
		await expect.element(nav).not.toBeInTheDocument();
	});

	it('closes with Escape', async () => {
		await page.viewport(390, 844);
		const screen = render(MainNav, { props });
		await screen.getByRole('button', { name: 'Menu' }).click();
		await expect.element(screen.getByRole('navigation', { name: 'Main' })).toBeVisible();
		await userEvent.keyboard('{Escape}');
		await expect.element(screen.getByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
	});
});

describe('MainNav on a wide screen', () => {
	it('shows the sidebar and no Menu button', async () => {
		await page.viewport(1280, 800);
		const screen = render(MainNav, { props });
		const nav = screen.getByRole('navigation', { name: 'Main' });
		await expect.element(nav).toBeVisible();
		await expect.element(nav.getByRole('link', { name: 'Recipes' })).toBeVisible();
		await expect.element(screen.getByRole('button', { name: 'Menu' })).not.toBeInTheDocument();
	});
});
