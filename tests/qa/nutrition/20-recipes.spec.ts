import type { Page } from '@playwright/test';
import { test, expect, open, shot } from './support';
import {
	createRecipe,
	ensureFood,
	fillRow,
	linkRow,
	own,
	perServing,
	saveRecipe,
	startRecipe
} from './fixtures';

test.describe.configure({ mode: 'serial' });

const R = 'recipes';
const N = 'nutrition';

const openRecipe = async (page: Page, title: string) => {
	await open(page, `/recipes?q=${title}`);
	await page.getByRole('link', { name: new RegExp(`^${title}`) }).first().click();
	await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
};
const editRecipe = async (page: Page) => {
	await page.getByRole('link', { name: 'Edit', exact: true }).click();
	await page.locator('html[data-hydrated="true"]').waitFor();
};
const rowState = (page: Page, n: number) => page.locator(`[data-row="${n}"] [data-food]`);

// ---- recipes: linking ----------------------------------------------------------------------

test('Link a row', async ({ page }) => {
	await startRecipe(page, 'qa-nut-link', 1, [
		{ amount: '1', unit: '', name: 'chicken breast', link: { query: 'chicken breast', food: 'Chicken' } }
	]);
	const linkedName = (await rowState(page, 1).locator('strong').innerText()).trim();
	await saveRecipe(page, 'qa-nut-link');
	await editRecipe(page);
	await expect(rowState(page, 1)).toHaveAttribute('data-food', 'linked');
	await expect(rowState(page, 1)).toContainText(linkedName);
	await shot(page, R, 'link-a-row');
});

test('Clear a link', async ({ page }) => {
	await openRecipe(page, 'qa-nut-link');
	await editRecipe(page);
	await expect(rowState(page, 1)).toHaveAttribute('data-food', 'linked');
	await page.getByRole('button', { name: 'Clear food, row 1' }).click();
	await expect(rowState(page, 1)).not.toHaveAttribute('data-food', 'linked');
	await saveRecipe(page, 'qa-nut-link');
	await expect(page.locator('[data-nutrition="none"]')).toBeVisible();
	await expect(page.locator('li[data-counts="false"]')).toHaveCount(1);
	await editRecipe(page);
	await expect(rowState(page, 1)).not.toHaveAttribute('data-food', 'linked');
	await shot(page, R, 'clear-a-link');
});

test("Another user's custom food", async ({ page, other }) => {
	await ensureFood(other, 'qa-nut-other');
	const { searchFoodsApi } = await import('./support');
	const foreign = (await searchFoodsApi(other, 'qa-nut-other')).foods.find(
		(f) => f.name === 'qa-nut-other'
	);
	expect(foreign).toBeTruthy();
	await open(page, '/recipes/new');
	await page.getByLabel('Title').fill('qa-nut-foreign');
	await page.getByLabel('Servings').fill('1');
	const li = page.locator('[data-row="1"]');
	await li.getByLabel('Amount, row 1').fill('100');
	await li.getByLabel('Unit, row 1').fill('g');
	await li.getByLabel('Name, row 1').fill('foreign food');
	await li.locator('input[name="ingredientFoodId"]').evaluate((el, id) => {
		(el as HTMLInputElement).value = id;
	}, foreign!.id);
	await li.locator('input[name="ingredientFoodName"]').evaluate((el) => {
		(el as HTMLInputElement).value = 'qa-nut-other';
	});
	await page.getByRole('button', { name: /^Save recipe/ }).click();
	await expect(page.getByText('That food was not found')).toBeVisible();
	await expect(page).toHaveURL(/\/recipes\/new/);
	await shot(page, R, 'another-users-custom-food');
	await open(page, '/recipes?q=qa-nut-foreign');
	await expect(page.getByRole('link', { name: /qa-nut-foreign/ })).toHaveCount(0);
});

// ---- recipes: suggestions ------------------------------------------------------------------

test('Accept a suggestion', async ({ page }) => {
	await startRecipe(page, 'qa-nut-accept', 1, [
		{ amount: '1', unit: '', name: 'yellow onion' }
	]);
	await expect(rowState(page, 1)).toHaveAttribute('data-food', 'suggested');
	await expect(rowState(page, 1)).toContainText('Onions, raw');
	await shot(page, R, 'accept-a-suggestion');
	await page.getByRole('button', { name: 'Use suggested food, row 1' }).click();
	await saveRecipe(page, 'qa-nut-accept');
	await editRecipe(page);
	await expect(rowState(page, 1)).toHaveAttribute('data-food', 'linked');
	await expect(rowState(page, 1)).toContainText('Onions, raw');
});

test('Ignored suggestion is not saved', async ({ page }) => {
	await startRecipe(page, 'qa-nut-ignore', 1, [
		{ amount: '1', unit: '', name: 'yellow onion' }
	]);
	await expect(rowState(page, 1)).toHaveAttribute('data-food', 'suggested');
	await saveRecipe(page, 'qa-nut-ignore');
	await expect(page.locator('li[data-counts="false"]')).toHaveCount(1);
	await expect(page.locator('[data-nutrition="none"]')).toBeVisible();
	await shot(page, R, 'ignored-suggestion-is-not-saved');
	await editRecipe(page);
	// Still only a suggestion, never a stored link.
	await expect(rowState(page, 1)).not.toHaveAttribute('data-food', 'linked');
});

test('Dismissed suggestion is not offered again on that row', async ({ page }) => {
	await startRecipe(page, 'qa-nut-dismiss', 1, [
		{ amount: '1', unit: '', name: 'yellow onion' }
	]);
	await expect(rowState(page, 1)).toHaveAttribute('data-food', 'suggested');
	await page.getByRole('button', { name: 'Dismiss suggested food, row 1' }).click();
	await expect(rowState(page, 1)).toHaveAttribute('data-food', 'none');
	await page.getByLabel('Name, row 1').fill('yellow onions');
	await page.getByLabel('Name, row 1').blur();
	await page.waitForTimeout(1500);
	await expect(rowState(page, 1)).toHaveAttribute('data-food', 'none');
});

test('No suggestion found', async ({ page }) => {
	await startRecipe(page, 'qa-nut-nosuggest', 1, [
		{ amount: '1', unit: '', name: 'zzqxflurbl' }
	]);
	await page.waitForTimeout(1500);
	await expect(rowState(page, 1)).toHaveAttribute('data-food', 'none');
	await expect(rowState(page, 1).getByText('Suggested', { exact: true })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Match food, row 1' })).toBeVisible();
	await shot(page, R, 'no-suggestion-found');
});

// ---- recipes: grams ------------------------------------------------------------------------

test('Weight asked for, not asked when the unit converts, invalid weight', async ({ page }) => {
	await startRecipe(page, 'qa-nut-grams', 1, [
		{ amount: '1', unit: 'bunch', name: 'cilantro', link: own('qa-nut-chicken') }
	]);
	const grams = page.getByLabel('About how many grams?');
	await expect(grams).toBeVisible();
	await expect(page.getByText(/adds no nutrition until you enter a weight/)).toBeVisible();
	await shot(page, R, 'weight-asked-for');

	// Weight not asked when the unit converts.
	await page.getByLabel('Amount, row 1').fill('200');
	await page.getByLabel('Unit, row 1').fill('g');
	await expect(grams).toHaveCount(0);
	await shot(page, R, 'weight-not-asked-when-the-unit-converts');

	// Invalid weight.
	await page.getByLabel('Amount, row 1').fill('1');
	await page.getByLabel('Unit, row 1').fill('bunch');
	await grams.fill('-5');
	await page.getByRole('button', { name: /^Save recipe/ }).click();
	await expect(page.getByText(/Weight must be more than 0/)).toBeVisible();
	await expect(page).toHaveURL(/\/recipes\/new/);
	await shot(page, R, 'invalid-weight');
	await open(page, '/recipes?q=qa-nut-grams');
	await expect(page.getByRole('link', { name: /qa-nut-grams/ })).toHaveCount(0);
});

// ---- recipes: per-serving display ----------------------------------------------------------

test('Per serving shown', async ({ page }) => {
	await openRecipe(page, 'qa-nut-full');
	await expect(page.locator('[data-nutrition="per-serving"]')).toContainText('230 kcal');
	await expect(page.locator('[data-nutrition="per-serving"]')).toContainText(/Protein/);
	await expect(page.locator('[data-nutrition="per-serving"]')).toContainText(/Carbs/);
	await expect(page.locator('[data-nutrition="per-serving"]')).toContainText(/Fat/);
	await expect(page.locator('[data-nutrition="partial"]')).toHaveCount(0);
	await expect(page.locator('li[data-counts="true"]')).toHaveCount(2);
	await shot(page, R, 'per-serving-shown');
});

test('Partial note', async ({ page }) => {
	await openRecipe(page, 'qa-nut-partial');
	await expect(page.locator('[data-nutrition="per-serving"]')).toContainText('330 kcal');
	await expect(page.locator('[data-nutrition="partial"]')).toContainText(
		'3 of 9 ingredients have no nutrition'
	);
	await expect(page.locator('li[data-counts="true"]')).toHaveCount(6);
	await expect(page.locator('li[data-counts="false"]')).toHaveCount(3);
	await shot(page, R, 'partial-note');
	await shot(page, N, 'partial-recipe');
});

// ---- nutrition: how amounts are counted ----------------------------------------------------

test('Unlinked ingredient adds nothing', async ({ page }) => {
	await createRecipe(page, 'qa-nut-pinch', 1, [
		{ amount: '100', unit: 'g', name: 'qa-nut-rice', link: own('qa-nut-rice') },
		{ amount: '1', unit: 'pinch', name: 'saffron' }
	]);
	expect(await perServing(page)).toBe(130);
	await expect(page.locator('[data-nutrition="partial"]')).toContainText('1 of 2');
	await shot(page, N, 'unlinked-ingredient-adds-nothing');
});

test('Weight unit', async ({ page }) => {
	await createRecipe(page, 'qa-nut-lb', 1, [
		{ amount: '1', unit: 'lb', name: 'ground turkey', link: own('qa-nut-chicken') }
	]);
	// 1 lb = 453.6 g at 165 kcal/100 g = 748.4 kcal.
	expect(await perServing(page)).toBe(748);
	await shot(page, N, 'weight-unit');
});

test('Food unit', async ({ page }) => {
	await createRecipe(page, 'qa-nut-cup', 1, [
		{
			amount: '2',
			unit: 'cup',
			name: 'rice',
			link: {
				query: 'rice white long-grain regular enriched cooked',
				food: 'Rice, white, long-grain, regular, enriched, cooked'
			}
		}
	]);
	// USDA: 130 kcal per 100 g, 1 cup = 158 g, so 2 cups = 316 g = about 411 kcal.
	const kcal = await perServing(page);
	expect(kcal).toBeGreaterThanOrEqual(409);
	expect(kcal).toBeLessThanOrEqual(413);
	await shot(page, N, 'food-unit');
});

test('Count with an each unit', async ({ page }) => {
	await createRecipe(page, 'qa-nut-each', 1, [
		{ amount: '2', unit: '', name: 'onions', link: { query: 'onions raw', food: 'Onions, raw' } }
	]);
	// USDA "Onions, raw": 40 kcal per 100 g, each (medium) 110 g, so 2 = 220 g = 88 kcal.
	expect(await perServing(page)).toBe(88);
	await shot(page, N, 'count-with-an-each-unit');
});

test('Grams entered on the row', async ({ page }) => {
	await createRecipe(page, 'qa-nut-bunch', 1, [
		{ amount: '1', unit: 'bunch', name: 'cilantro', link: own('qa-nut-chicken'), grams: '60' }
	]);
	// 60 g at 165 kcal/100 g = 99 kcal.
	expect(await perServing(page)).toBe(99);
	await shot(page, N, 'grams-entered-on-the-row');
	await editRecipe(page);
	await expect(page.getByLabel('About how many grams?')).toHaveValue('60');
});

test('Full recipe', async ({ page }) => {
	await openRecipe(page, 'qa-nut-full');
	expect(await perServing(page)).toBe(230);
	await expect(page.locator('[data-nutrition="partial"]')).toHaveCount(0);
	await shot(page, N, 'full-recipe');
});

test('Nothing linked', async ({ page }) => {
	await createRecipe(page, 'qa-nut-none', 1, [{ amount: '1', unit: 'pinch', name: 'saffron' }]);
	await expect(page.locator('[data-nutrition="none"]')).toContainText('No nutrition yet');
	await shot(page, N, 'nothing-linked');
});

// keep helpers referenced for lint-free reuse
void fillRow;
void linkRow;
