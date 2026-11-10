// Short regression pass: every top-level page loads for a signed-in user without console errors.
import { expect, open, shot, test } from './support';

for (const [path, heading] of [
	['/recipes', 'Recipes'],
	['/plan', null],
	['/leftovers', 'Leftovers'],
	['/grocery', null],
	['/nutrition', null]
] as const) {
	test(`regression: ${path} loads`, async ({ page }) => {
		const errors: string[] = [];
		page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
		page.on('pageerror', (e) => errors.push(String(e)));
		await open(page, path);
		await expect(page).toHaveURL(new RegExp(`${path}`));
		if (heading)
			await expect(page.getByRole('heading', { name: heading, exact: true }).first()).toBeVisible();
		await page.waitForLoadState('networkidle');
		expect(errors, `console errors on ${path}`).toEqual([]);
		await shot(page, 'regression', path.slice(1));
	});
}
