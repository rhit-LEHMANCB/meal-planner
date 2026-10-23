// QA for the foods capability of weekly-plan-leftovers (dev site).
import {
	clearWeeks,
	createFood,
	dialog,
	entryIn,
	expect,
	FAKE_ID,
	FRUN,
	openAdd,
	openWeek,
	postAction,
	QA_PREFIX,
	searchFood,
	searchFoodsApi,
	shot,
	slot,
	test
} from './support';

const CAP = 'foods';
const W = {
	create: '2031-07-07',
	invalid: '2031-07-14',
	units: '2031-07-21',
	foreign: '2031-07-28',
	search: '2031-08-04'
};
const yogurt = `${QA_PREFIX}fd-yogurt-${FRUN}`;
const greek = `${QA_PREFIX}fd-greek-${FRUN}`;
const granola = `${QA_PREFIX}fd-granola-${FRUN}`;
const noMatch = `${QA_PREFIX}fd-nomatch-zzz-${FRUN}`;
const bad = `${QA_PREFIX}fd-badnumbers-${FRUN}`;

test('reset the QA weeks', async ({ page }) => {
	await clearWeeks(page, Object.values(W));
});

test('Create and add', async ({ page }) => {
	await openWeek(page, W.create);
	await createFood(
		page,
		'Mon breakfast',
		greek,
		{ kcal: '97', protein: '9', carbs: '4', fat: '5' },
		'170'
	);
	const e = entryIn(page, 'Mon breakfast', greek);
	await expect(e).toContainText('170 g');
	await shot(page, CAP, 'create-and-add');
	// Saved as theirs: a later search finds it, marked as the user's own.
	const found = (await searchFoodsApi(page, 'qa-fd-greek')).foods.filter((f) => f.name === greek);
	expect(found).toHaveLength(1);
	expect(found[0].own).toBe(true);
	await openAdd(page, 'Tue breakfast');
	await searchFood(page, 'greek');
	await expect(dialog(page).getByRole('radio', { name: new RegExp(greek) })).toBeVisible();
});

test('Search finds a custom food', async ({ page }) => {
	await openWeek(page, W.search);
	await createFood(
		page,
		'Mon breakfast',
		yogurt,
		{ kcal: '60', protein: '10', carbs: '4', fat: '0' },
		'100'
	);
	await openAdd(page, 'Tue breakfast');
	await searchFood(page, 'YOG');
	const row = dialog(page).getByRole('radio', { name: new RegExp(yogurt) });
	await expect(row).toBeVisible();
	await expect(dialog(page).getByText('your food').first()).toBeVisible();
	await shot(page, CAP, 'search-finds-a-custom-food');
});

test('No match', async ({ page }) => {
	await openWeek(page, W.search);
	await openAdd(page, 'Wed breakfast');
	await searchFood(page, noMatch);
	await expect(dialog(page).getByText(/No foods match/)).toBeVisible();
	await expect(
		dialog(page).getByRole('button', { name: `Create \u201c${noMatch}\u201d` })
	).toBeVisible();
	await shot(page, CAP, 'no-match');
});

test('Invalid numbers', async ({ page }) => {
	await openWeek(page, W.invalid);
	await openAdd(page, 'Mon breakfast');
	await searchFood(page, bad);
	await dialog(page)
		.getByRole('button', { name: `Create \u201c${bad}\u201d` })
		.click();
	const d = dialog(page);
	await d.getByLabel('kcal', { exact: true }).fill('100');
	await d.getByLabel('Protein g').fill('-3');
	await d.getByLabel('Carbs g').fill('4');
	await d.getByLabel('Fat g').fill('5');
	await d.getByLabel('Amount').fill('50');
	await d.getByRole('button', { name: 'Create food and add' }).click();
	await expect(d.locator('#add-error-protein')).toBeVisible();
	await expect(d.getByLabel('Protein g')).toHaveAttribute('aria-invalid', 'true');
	await shot(page, CAP, 'invalid-numbers');
	await page.keyboard.press('Escape');
	expect((await searchFoodsApi(page, bad)).foods).toHaveLength(0);
	await page.reload();
	await expect(slot(page, 'Mon breakfast').getByTestId('plan-entry')).toHaveCount(0);
});

test('Food with an extra unit', async ({ page }) => {
	await openWeek(page, W.units);
	let withUnits: { name: string; units: string[] } | undefined;
	for (const q of ['egg', 'rice', 'oil', 'milk', 'bread', 'oat', 'banana', 'a', 'e']) {
		withUnits = (await searchFoodsApi(page, q)).foods.find((f) => !f.own && f.units.length > 1);
		if (withUnits) break;
	}
	test.skip(
		!withUnits,
		'The dev database has no shared food with an extra unit, so this cannot be exercised.'
	);
	await openAdd(page, 'Mon lunch');
	await searchFood(page, withUnits!.name);
	await dialog(page)
		.getByRole('radio', { name: new RegExp(withUnits!.name) })
		.first()
		.check();
	await expect(dialog(page).getByLabel('Unit').locator('option')).toHaveText(withUnits!.units);
	await shot(page, CAP, 'food-with-an-extra-unit');
});

test('Custom food', async ({ page }) => {
	await openWeek(page, W.search);
	await openAdd(page, 'Thu breakfast');
	await searchFood(page, yogurt);
	await dialog(page)
		.getByRole('radio', { name: new RegExp(yogurt) })
		.check();
	await expect(dialog(page).getByLabel('Unit').locator('option')).toHaveText(['g']);
	await expect(dialog(page).getByLabel('Unit')).toHaveValue('g');
	await shot(page, CAP, 'custom-food');
});

test("Another user's custom food in search", async ({ page, other }) => {
	await openWeek(page, W.foreign);
	await createFood(
		page,
		'Mon breakfast',
		granola,
		{ kcal: '450', protein: '10', carbs: '60', fat: '15' },
		'40'
	);
	await openWeek(other, W.foreign);
	await openAdd(other, 'Mon breakfast');
	await searchFood(other, 'granola');
	await expect(dialog(other).getByText(/No foods match/)).toBeVisible();
	await expect(dialog(other).getByRole('radio', { name: new RegExp(granola) })).toHaveCount(0);
	expect(
		(await searchFoodsApi(other, 'granola')).foods.filter((f) => f.name === granola)
	).toHaveLength(0);
	await shot(other, CAP, 'another-users-custom-food-in-search');
});

test("Another user's custom food by id", async ({ page, other }) => {
	await openWeek(page, W.foreign);
	const food = (await searchFoodsApi(page, granola)).foods.find((f) => f.name === granola)!;
	expect(food).toBeTruthy();
	await openWeek(other, W.foreign);
	const add = (id: string) =>
		postAction(other, '/plan?/addFood', {
			date: W.foreign,
			slot: 'lunch',
			foodId: id,
			amount: '30',
			unit: 'g'
		});
	const foreign = await add(food.id);
	const missing = await add(FAKE_ID);
	console.log('foreign food:', foreign.body.slice(0, 200));
	expect(foreign).toEqual(missing);
	expect(foreign.body).toContain('"type":"failure"');
	await other.reload();
	await expect(other.getByTestId('plan-entry').filter({ visible: true })).toHaveCount(0);
	await shot(other, CAP, 'another-users-custom-food-by-id');
});

test('cleanup qa data', async ({ page }) => {
	await clearWeeks(page, Object.values(W));
});
