import { test, expect, open, ALL_WEEKS, clearWeeks, cleanupRecipes, mondayOf, todayUtc, shot } from './support';
import { clearLogs } from './fixtures';

test('Regression: top-level pages load without console errors', async ({ page }) => {
	const errors: string[] = [];
	page.on('console', (m) => {
		if (m.type() === 'error') errors.push(m.text());
	});
	page.on('pageerror', (e) => errors.push(String(e)));
	for (const [path, heading] of [
		['/recipes', /Recipes/],
		['/plan', /./],
		['/grocery', /./],
		['/leftovers', /./],
		['/nutrition', /Nutrition/]
	] as const) {
		const res = await page.goto(path);
		expect(res?.status(), path).toBeLessThan(400);
		await page.locator('html[data-hydrated="true"]').waitFor();
		await expect(page.getByRole('heading', { level: 1 }).first()).toContainText(heading);
	}
	await open(page, '/nutrition');
	await shot(page, 'regression', 'nutrition-page');
	expect(errors, errors.join('\n')).toEqual([]);
});

test('Cleanup: remove every qa- recipe, plan entry and log entry', async ({ page, browser }) => {
	test.setTimeout(180_000);
	await clearLogs(page, [...ALL_WEEKS, mondayOf(todayUtc())]);
	await clearWeeks(page, ALL_WEEKS);
	await cleanupRecipes(browser);
	await open(page, '/recipes?q=qa-');
	await expect(page.getByRole('link', { name: /^qa-/ })).toHaveCount(0);
});
