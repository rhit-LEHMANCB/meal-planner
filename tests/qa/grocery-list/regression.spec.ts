// Short regression pass for grocery-list QA: top-level pages load without console errors.
import { expect, gshot, open, test } from './support';

for (const [path, heading] of [
	['/recipes', 'Recipes'],
	['/plan', null],
	['/leftovers', 'Leftovers'],
	['/grocery', 'Grocery list'],
	['/nutrition', null]
] as const) {
	test(`regression: ${path} loads`, async ({ page }) => {
		const errors: string[] = [];
		page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
		page.on('pageerror', (e) => errors.push(String(e)));
		await open(page, path);
		if (heading)
			await expect(page.getByRole('heading', { name: heading, exact: true }).first()).toBeVisible();
		await page.waitForLoadState('networkidle');
		expect(errors, `console errors on ${path}`).toEqual([]);
		await gshot(page, 'regression', path.slice(1));
	});
}
