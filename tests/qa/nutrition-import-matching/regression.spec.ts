import { expect, test } from '@playwright/test';
import { credentials, deleteQaRecipes, open, signIn } from '../helpers';
import { fillRow, shot } from '../ai-recipe-import/support';

test('regression: pages load without console errors', async ({ page }) => {
	const errors: string[] = [];
	page.on('console', (m) => m.type() === 'error' && errors.push(`${page.url()} ${m.text()}`));
	page.on('pageerror', (e) => errors.push(`pageerror ${page.url()} ${e.message}`));
	await signIn(page, credentials().user);
	for (const p of ['/recipes', '/plan', '/grocery', '/leftovers', '/nutrition']) {
		await open(page, p);
		await expect(page.getByRole('heading').first()).toBeVisible();
	}
	await open(page, '/recipes/new');
	await page.getByLabel('Title').fill(`qa-regression-${Date.now()}`);
	await page.getByLabel('Servings').fill('2');
	await fillRow(page, 1, { amount: '2', unit: 'tbsp', name: 'olive oil' });
	await page.getByLabel('Steps').fill('Mix.');
	await page.getByRole('button', { name: /Save/ }).click();
	await expect(page.getByRole('link', { name: 'Edit', exact: true })).toBeVisible();
	await page.getByRole('link', { name: 'Edit', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Edit recipe' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Match with AI' })).toBeVisible();
	await shot(page, 'regression-edit-page');
	await deleteQaRecipes(page);
	console.log(`NOTE console errors: ${JSON.stringify(errors)}`);
	expect(errors).toEqual([]);
});
