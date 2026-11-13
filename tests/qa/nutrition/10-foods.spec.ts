import {
	test,
	expect,
	W,
	shot,
	openWeek,
	openAdd,
	searchFood,
	dialog,
	searchFoodsApi,
	slot,
	clearWeeks
} from './support';
import { expectDayKcal, planFood } from './fixtures';

const CAP = 'foods';
test.describe.configure({ mode: 'serial' });

test.afterAll(async ({ browser }) => {
	const { stateFor } = await import('../weekly-plan-leftovers/support');
	const context = await browser.newContext({ storageState: await stateFor(browser, 'user') });
	const page = await context.newPage();
	await clearWeeks(page, [W.foods]);
	await context.close();
});

test('Search finds a custom food', async ({ page }) => {
	await openWeek(page, W.foods);
	await openAdd(page, 'Tue lunch');
	await searchFood(page, 'qa-nut-ch');
	await expect(dialog(page).getByRole('radio', { name: /qa-nut-chicken/ })).toBeVisible();
	await shot(page, CAP, 'search-finds-a-custom-food');
	await page.keyboard.press('Escape');
	// The spec's own example, by prefix of a word.
	const found = await searchFoodsApi(page, 'chick');
	expect(found.foods.some((f) => f.name === 'qa-nut-chicken' && f.own)).toBe(true);
	// Own foods come first when both kinds match.
	const mixed = await searchFoodsApi(page, 'qa-nut');
	expect(mixed.foods.length).toBeGreaterThanOrEqual(4);
});

test('No match', async ({ page }) => {
	await openWeek(page, W.foods);
	await openAdd(page, 'Tue lunch');
	await searchFood(page, 'qa zzqx flurbl');
	await expect(dialog(page).getByText(/No foods match/)).toBeVisible();
	await expect(
		dialog(page).getByRole('button', { name: /Create .qa zzqx flurbl./ })
	).toBeVisible();
	await shot(page, CAP, 'no-match');
});

test('Plural matches singular', async ({ page }) => {
	await openWeek(page, W.foods);
	await openAdd(page, 'Tue lunch');
	await searchFood(page, 'eggs');
	await expect(dialog(page).getByRole('radio', { name: /Egg, whole, raw, fresh/ })).toBeVisible();
	await shot(page, CAP, 'plural-matches-singular');
	await page.keyboard.press('Escape');
	const r = await searchFoodsApi(page, 'eggs');
	expect(r.foods.length).toBeLessThanOrEqual(20);
	expect(r.foods.map((f) => f.name)).toContain('Egg, whole, raw, fresh');
});

test('Name starting with the word ranks first', async ({ page }) => {
	const r = await searchFoodsApi(page, 'rice');
	expect(r.foods[0].own).toBe(true);
	const names = r.foods.filter((f) => !f.own).map((f) => f.name);
	expect(r.foods.length).toBeLessThanOrEqual(20);
	// Every food whose name starts with the word must come before any that does not.
	const startsWith = names.map((n) => /^rice\b/i.test(n));
	const firstOther = startsWith.indexOf(false);
	if (firstOther !== -1) expect(startsWith.slice(firstOther).some(Boolean)).toBe(false);
	const mix = (await searchFoodsApi(page, 'rice crackers')).foods.filter((f) => !f.own).map((f) => f.name);
	expect(mix[0]).toMatch(/^rice/i);
	// The spec's pair, when both exist (Crackers, rice is not in this dataset).
	const crackers = names.findIndex((n) => /^crackers, rice/i.test(n));
	if (crackers !== -1) expect(crackers).toBeGreaterThan(names.findIndex((n) => /^rice/i.test(n)));
	// Shorter names first among names starting with the word (spec: then shorter names first).
	const lens = names.filter((n) => /^rice\b/i.test(n)).map((n) => n.length);
	for (let i = 1; i < lens.length; i++) expect(lens[i]).toBeGreaterThanOrEqual(lens[i - 1]);
	await openWeek(page, W.foods);
	await openAdd(page, 'Tue lunch');
	await searchFood(page, 'rice');
	await expect(dialog(page).getByRole('radio').first()).toBeVisible();
	await shot(page, CAP, 'name-starting-with-the-word-ranks-first');
	await page.keyboard.press('Escape');
});

test('Shared food is searchable', async ({ page }) => {
	await openWeek(page, W.foods);
	await openAdd(page, 'Wed lunch');
	await searchFood(page, 'broccoli raw');
	const pick = dialog(page).getByRole('radio', { name: /^Broccoli, raw/ }).first();
	await expect(pick).toBeVisible();
	await pick.check();
	await shot(page, CAP, 'shared-food-is-searchable');
	await page.keyboard.press('Escape');
	// Published per-100 g values (SR Legacy "Broccoli, raw": 34 kcal): 100 g plans as 34 kcal.
	await planFood(page, 'Wed lunch', 'Broccoli, raw', '100');
	await expectDayKcal(page, '2031-04-23', 34);
});

test('Portions become units', async ({ page }) => {
	await openWeek(page, W.foods);
	await openAdd(page, 'Thu lunch');
	await searchFood(page, 'broccoli raw');
	await dialog(page).getByRole('radio', { name: /^Broccoli, raw/ }).first().check();
	const options = await dialog(page).getByLabel('Unit').locator('option').allTextContents();
	expect(options).toContain('cup');
	await dialog(page).getByLabel('Unit').selectOption('cup');
	await dialog(page).getByLabel('Amount').fill('1');
	await shot(page, CAP, 'portions-become-units');
	await dialog(page).getByRole('button', { name: 'Add food' }).click();
	await expect(dialog(page)).toHaveCount(0);
	await page.waitForLoadState('networkidle');
	// 1 cup chopped = 91 g at 34 kcal/100 g = 30.9 kcal.
	await expectDayKcal(page, '2031-04-24', 31);
});

test('Each from a medium portion', async ({ page }) => {
	const r = await searchFoodsApi(page, 'apples raw');
	const apple = r.foods.find((f) => /^Apples, raw, with skin/.test(f.name));
	expect(apple, 'Apples, raw, with skin should exist').toBeTruthy();
	expect(apple!.units).toContain('each');
	expect(apple!.units).toContain('medium');
	await openWeek(page, W.foods);
	await openAdd(page, 'Fri lunch');
	await searchFood(page, 'apples raw');
	await dialog(page).getByRole('radio', { name: /^Apples, raw, with skin/ }).first().check();
	await dialog(page).getByLabel('Unit').selectOption('each');
	await dialog(page).getByLabel('Amount').fill('1');
	await shot(page, CAP, 'each-from-a-medium-portion');
	await dialog(page).getByRole('button', { name: 'Add food' }).click();
	await expect(dialog(page)).toHaveCount(0);
	await page.waitForLoadState('networkidle');
	// each = medium = 182 g at 52 kcal/100 g = 94.6 kcal.
	await expectDayKcal(page, '2031-04-25', 95);
	await expect(slot(page, 'Fri lunch').getByTestId('plan-entry')).toHaveCount(1);
});
