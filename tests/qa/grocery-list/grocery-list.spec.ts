// QA for the grocery-list capability (dev site). One test per spec scenario.
import type { Page } from '@playwright/test';
import {
	addCook,
	addExistingFood,
	addLeftover,
	aisle,
	cleanupGrocery,
	cleanupRecipes,
	clearWeeks,
	createFood,
	createRecipeWith,
	dialog,
	expect,
	extraIds,
	gshot,
	GW,
	openGrocery,
	openWeek,
	postAction,
	progress,
	QA_PREFIX,
	row,
	searchFoodsApi,
	stateFor,
	test,
	mondayOf,
	open,
	todayUtc
} from './support';

test.describe.configure({ mode: 'serial' });
const CAP = 'grocery-list';
const T = (s: string) => `${QA_PREFIX}gl-${s}`;
const chili = T('chili');
const pancakes = T('pancakes');
const pizza = T('pizza');
const gochu = T('gochu');
const apple = T('apple');
const stew = T('stew');
/** A SvelteKit action answers HTTP 200 with {type, status}; the effective status is inside. */
const code = (r: { status: number; body: string }) => {
	try {
		const j = JSON.parse(r.body) as { type?: string; status?: number };
		return j.type === 'failure' || j.type === 'error' ? (j.status ?? r.status) : r.status;
	} catch {
		return r.status;
	}
};
const add = (page: Page) => page.getByRole('button', { name: 'Add', exact: true });

test.setTimeout(150_000);

const unticks = async (browser: import('@playwright/test').Browser) => {
	const context = await browser.newContext({ storageState: await stateFor(browser, 'user') });
	const page = await context.newPage();
	await openGrocery(page, GW.main);
	for (const w of [GW.main, GW.raised, GW.lowered])
		for (const key of ['onion', 'lemon'])
			await postAction(page, '/grocery?/tick', { week: w, key, checked: 'false' });
	await context.close();
};
test.beforeAll(async ({ browser }) => {
	await cleanupRecipes(browser);
	await unticks(browser);
});
test.afterAll(async ({ browser }) => {
	await cleanupGrocery(browser);
	await unticks(browser);
	const context = await browser.newContext({ storageState: await stateFor(browser, 'user') });
	const page = await context.newPage();
	await clearWeeks(page, [GW.foods]);
	await context.close();
	await cleanupRecipes(browser);
});

test('setup: recipes', async ({ page }) => {
	await createRecipeWith(page, chili, 4, [
		'2 onion',
		'1 lb ground turkey',
		'salt to taste',
		'1 lemon'
	]);
	await createRecipeWith(page, pancakes, 4, ['1 cup Flour', '1 Tablespoons soy sauce', '1 onion']);
	await createRecipeWith(page, pizza, 4, [
		'1 cup flour',
		'200 g flour',
		'2 tbsp soy sauce',
		'2 onions'
	]);
	await createRecipeWith(page, stew, 4, ['3 carrots', '1 tsp thyme']);
	await createRecipeWith(page, gochu, 4, ['1 Gochujang']);
});

test('Week from the address', async ({ page }) => {
	await openGrocery(page, '2026-11-09');
	await expect(page).toHaveURL(/week=2026-11-09$/);
	await expect(page.getByText('Nov 9 – 15')).toBeVisible();
	await expect(page.getByRole('link', { name: 'Previous week' })).toHaveAttribute(
		'href',
		/week=2026-11-02/
	);
	await expect(page.getByRole('link', { name: 'Next week' })).toHaveAttribute(
		'href',
		/week=2026-11-16/
	);
	await expect(page.getByRole('link', { name: 'This week', exact: true })).toHaveAttribute(
		'href',
		new RegExp(`week=${mondayOf(todayUtc())}`)
	);
	await gshot(page, CAP, 'week-from-the-address');
});

test('Not a Monday', async ({ page }) => {
	await page.goto('/grocery?week=2026-11-11');
	await expect(page).toHaveURL(/\/grocery\?week=2026-11-09$/);
	await gshot(page, CAP, 'not-a-monday');
	// Observation: an invalid date is not redirected (same as /plan); the page just shows this week.
	await page.goto('/grocery?week=garbage');
	await expect(page.getByRole('heading', { name: 'Grocery list' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'This week', exact: true })).toHaveAttribute(
		'aria-current',
		'page'
	);
	// Missing week: shows this week (URL stays /grocery when the browser week matches the server's).
	await open(page, '/grocery');
	await expect(page.getByRole('link', { name: 'This week', exact: true })).toHaveAttribute(
		'aria-current',
		'page'
	);
});

test('Signed out', async ({ browser }) => {
	const context = await browser.newContext();
	const page = await context.newPage();
	await page.goto('/grocery');
	await expect(page).toHaveURL(/\/signin/);
	await gshot(page, CAP, 'signed-out');
	await context.close();
});

test('Chili week: scaling, no amount, rounding, aisles, leftovers add nothing', async ({
	page
}) => {
	await openWeek(page, GW.main);
	await addCook(page, 'Mon dinner', chili, 6, 2);
	await addLeftover(page, 'Tue lunch', chili, 1);
	await addLeftover(page, 'Wed lunch', chili, 1);
	await addLeftover(page, 'Thu lunch', chili, 1);
	await openGrocery(page, GW.main);
	await expect(row(page, 'onion')).toContainText('3');
	await expect(row(page, 'onion')).toContainText(chili);
	await expect(row(page, 'salt')).toContainText(/as needed/i);
	await expect(row(page, 'lemon')).toContainText('2');
	await expect(row(page, 'ground turkey')).toContainText('1 1/2 lb');
	await expect(aisle(page, 'Produce')).toContainText(/onion/i);
	await expect(aisle(page, 'Meat and fish')).toContainText(/ground turkey/i);
	await expect(page.getByTestId('grocery-item').filter({ hasText: /onion/i })).toHaveCount(1);
	await expect(page.getByText('Covers 1 cook and 0 foods')).toBeVisible();
	for (const slug of [
		'scaled-to-servings-cooked',
		'leftover-in-the-week',
		'no-amount',
		'count-rounds-up',
		'weight-keeps-decimals',
		'guessed-aisle',
		'the-list-explains-what-it-covers'
	])
		await gshot(page, CAP, slug);
});

test('Unknown name', async ({ page }) => {
	await openWeek(page, GW.aisleA);
	await addCook(page, 'Mon dinner', gochu, 4, 4);
	await openGrocery(page, GW.aisleA);
	await expect(aisle(page, 'Other')).toContainText(/gochujang/i);
	await gshot(page, CAP, 'unknown-name');
});

test('Tick and reload / repeated tick', async ({ page }) => {
	await openGrocery(page, GW.main);
	await expect(progress(page)).toHaveText(/^0 of \d+ in the cart$/);
	await row(page, 'onion').getByRole('button', { pressed: false }).first().click();
	await expect(row(page, 'onion').getByRole('button', { pressed: true })).toBeVisible();
	await expect(progress(page)).toContainText(/^1 of/);
	await page.reload();
	await expect(row(page, 'onion').getByRole('button', { pressed: true })).toBeVisible();
	await expect(progress(page)).toContainText(/^1 of/);
	await gshot(page, CAP, 'tick-and-reload');
	const key = await row(page, 'onion').locator('input[name="key"]').first().inputValue();
	const r1 = await postAction(page, '/grocery?/tick', { week: GW.main, key, checked: 'true' });
	const r2 = await postAction(page, '/grocery?/tick', { week: GW.main, key, checked: 'true' });
	expect(r1.status).toBeLessThan(300);
	expect(r2.status).toBeLessThan(300);
	await page.reload();
	await expect(progress(page)).toContainText(/^1 of/);
	await expect(row(page, 'onion').getByRole('button', { pressed: true })).toBeVisible();
	await gshot(page, CAP, 'repeated-tick');
	await postAction(page, '/grocery?/tick', { week: GW.main, key, checked: 'false' });
	await page.reload();
	await expect(progress(page)).toContainText(/^0 of/);
});

test('Ticking and adding work without JavaScript', async ({ browser }) => {
	const context = await browser.newContext({
		storageState: await stateFor(browser, 'user'),
		javaScriptEnabled: false,
		viewport: { width: 1000, height: 900 }
	});
	const page = await context.newPage();
	await page.goto(`/grocery?week=${GW.main}`);
	await row(page, 'lemon').getByRole('button', { pressed: false }).first().click();
	await expect(row(page, 'lemon').getByRole('button', { pressed: true })).toBeVisible();
	await expect(progress(page)).toContainText(/^1 of/);
	await page.reload();
	await expect(row(page, 'lemon').getByRole('button', { pressed: true })).toBeVisible();
	await gshot(page, CAP, 'ticking-works-without-javascript');
	await page.getByLabel('Add an item').fill(`${QA_PREFIX}nojs sponge`);
	await add(page).click();
	await expect(page.getByText(`${QA_PREFIX}nojs sponge`).first()).toBeVisible();
	const key = await row(page, 'lemon').locator('input[name="key"]').first().inputValue();
	await context.close();
	const c2 = await browser.newContext({ storageState: await stateFor(browser, 'user') });
	const p2 = await c2.newPage();
	await openGrocery(p2, GW.main);
	await postAction(p2, '/grocery?/tick', { week: GW.main, key, checked: 'false' });
	await c2.close();
});

const editCook = async (page: Page, title: string, where: string, n: number) => {
	await page
		.getByRole('button', { name: new RegExp(`^Edit ${title}, ${where}`) })
		.filter({ visible: true })
		.click();
	await dialog(page).getByLabel('Servings to cook').fill(String(n));
	await dialog(page).getByRole('button', { name: 'Save changes' }).click();
	await expect(dialog(page)).toHaveCount(0);
	await page.waitForLoadState('networkidle');
};

test('Servings raised', async ({ page }) => {
	await openWeek(page, GW.raised);
	await addCook(page, 'Mon dinner', chili, 6, 2);
	await openGrocery(page, GW.raised);
	await row(page, 'onion').getByRole('button', { pressed: false }).first().click();
	await expect(row(page, 'onion').getByRole('button', { pressed: true })).toBeVisible();
	await openWeek(page, GW.raised);
	await editCook(page, chili, 'Mon dinner', 8);
	await openGrocery(page, GW.raised);
	const r = row(page, 'onion');
	await expect(r).toContainText('4');
	await expect(r).toContainText('More needed since you ticked it');
	await expect(r.getByRole('button', { pressed: false }).first()).toBeVisible();
	await gshot(page, CAP, 'servings-raised');
	await r.getByRole('button', { pressed: false }).first().click();
	await expect(r.getByRole('button', { pressed: true })).toBeVisible();
	await page.reload();
	await expect(row(page, 'onion')).not.toContainText('More needed');
	await expect(row(page, 'onion').getByRole('button', { pressed: true })).toBeVisible();
});

test('Servings lowered', async ({ page }) => {
	await openWeek(page, GW.lowered);
	await addCook(page, 'Mon dinner', chili, 6, 2);
	await openGrocery(page, GW.lowered);
	await row(page, 'onion').getByRole('button', { pressed: false }).first().click();
	await expect(row(page, 'onion').getByRole('button', { pressed: true })).toBeVisible();
	await openWeek(page, GW.lowered);
	await editCook(page, chili, 'Mon dinner', 4);
	await openGrocery(page, GW.lowered);
	const r = row(page, 'onion');
	await expect(r).toContainText('2');
	await expect(r.getByRole('button', { pressed: true })).toBeVisible();
	await expect(r).not.toContainText('More needed');
	await gshot(page, CAP, 'servings-lowered');
});

test('Leftover from last week cook, and empty week', async ({ page }) => {
	await openWeek(page, GW.cookWeek);
	await addCook(page, 'Sun dinner', stew, 4, 1);
	await openWeek(page, GW.leftoverWeek);
	await addLeftover(page, 'Mon lunch', stew, 1);
	await openGrocery(page, GW.leftoverWeek);
	await expect(page.getByTestId('grocery-item')).toHaveCount(0);
	await expect(page.getByText(stew)).toHaveCount(0);
	await expect(page.getByText('Nothing to buy yet')).toBeVisible();
	await gshot(page, CAP, 'leftover-from-last-weeks-cook');
	await openGrocery(page, GW.empty);
	await expect(page.getByText('Nothing to buy yet')).toBeVisible();
	const link = page.getByRole('link', { name: 'Plan this week' });
	await expect(link).toHaveAttribute('href', `/plan?week=${GW.empty}`);
	await gshot(page, CAP, 'empty-week');
	await link.click();
	await expect(page).toHaveURL(new RegExp(`/plan\\?week=${GW.empty}`));
});

test('Snack foods', async ({ page }) => {
	await openWeek(page, GW.foods);
	const found = (await searchFoodsApi(page, apple)).foods.some((f) => f.name === apple);
	for (const [i, d] of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].entries()) {
		if (i === 0 && !found)
			await createFood(
				page,
				`${d} snack`,
				apple,
				{ kcal: '52', protein: '0.3', carbs: '14', fat: '0.2' },
				'150'
			);
		else await addExistingFood(page, `${d} snack`, apple, '150');
	}
	await openGrocery(page, GW.foods);
	await expect(row(page, apple)).toContainText('750 g');
	await expect(row(page, apple)).toContainText('Snack');
	await expect(page.getByText('Covers 0 cooks and 5 foods')).toBeVisible();
	await gshot(page, CAP, 'snack-foods');
});

test('Merging: same and different units, spellings, names', async ({ page }) => {
	await openWeek(page, GW.merge);
	await addCook(page, 'Mon dinner', pancakes, 4, 4);
	await addCook(page, 'Tue dinner', pizza, 4, 4);
	await openGrocery(page, GW.merge);
	const flour = row(page, 'flour');
	await expect(flour).toHaveCount(1);
	await expect(flour).toContainText('2 cup + 200 g');
	await expect(flour).toContainText(`${pancakes}, ${pizza}`);
	await gshot(page, CAP, 'same-and-different-units');
	await expect(row(page, 'soy sauce')).toContainText('3 tbsp');
	await gshot(page, CAP, 'unit-spellings-match');
	await expect(row(page, 'onion')).toHaveCount(1);
	await expect(row(page, 'onions')).toHaveCount(1);
	await gshot(page, CAP, 'different-names-stay-apart');
});

test('Aisle: remembered on other weeks, unknown aisle refused', async ({ page }) => {
	await openWeek(page, GW.aisleB);
	await addCook(page, 'Mon dinner', gochu, 4, 4);
	await openGrocery(page, GW.aisleA);
	await expect(aisle(page, 'Other')).toContainText(/gochujang/i);
	await page.getByRole('button', { name: /^More for gochujang/i }).click();
	const menu = page.getByRole('dialog').filter({ visible: true });
	await menu.getByLabel('Pantry').check();
	await menu.getByRole('button', { name: 'Move' }).click();
	await expect(aisle(page, 'Pantry')).toContainText(/gochujang/i);
	await openGrocery(page, GW.aisleB);
	await expect(aisle(page, 'Pantry')).toContainText(/gochujang/i);
	await gshot(page, CAP, 'remembered-on-other-weeks');
	await page.getByRole('button', { name: /^More for gochujang/i }).click();
	const m2 = page.getByRole('dialog').filter({ visible: true });
	await m2
		.locator('input[type=radio]')
		.first()
		.evaluate((el) => {
			(el as HTMLInputElement).value = 'Garden';
			(el as HTMLInputElement).checked = true;
		});
	await m2.getByRole('button', { name: 'Move' }).click();
	await expect(page.getByRole('alert')).toBeVisible();
	await gshot(page, CAP, 'unknown-aisle-refused');
	await page.reload();
	await expect(aisle(page, 'Pantry')).toContainText(/gochujang/i);
});

test('Aisle choice applies to extra items, then reset', async ({ page }) => {
	await openGrocery(page, GW.extras);
	await page.getByLabel('Add an item').fill('Gochujang');
	await add(page).click();
	await expect(aisle(page, 'Pantry')).toContainText(/gochujang/i);
	await gshot(page, CAP, 'aisle-choice-applies-to-extra-items');
	for (const id of await extraIds(page))
		await postAction(page, '/grocery?/remove', { week: GW.extras, id });
	// put the QA account preference back to Other
	await openGrocery(page, GW.aisleA);
	await page.getByRole('button', { name: /^More for gochujang/i }).click();
	const m3 = page.getByRole('dialog').filter({ visible: true });
	await m3.getByLabel('Other').check();
	await m3.getByRole('button', { name: 'Move' }).click();
	await expect(aisle(page, 'Other')).toContainText(/gochujang/i);
});

test('Extra items: add, blank, delete, tick', async ({ page }) => {
	await openGrocery(page, GW.extras);
	for (const id of await extraIds(page))
		await postAction(page, '/grocery?/remove', { week: GW.extras, id });
	await openGrocery(page, GW.extras);
	await page.getByLabel('Add an item').fill('2 qa paper towels');
	await add(page).click();
	const r = row(page, 'qa paper towels');
	await expect(r).toContainText('2');
	await expect(r).toContainText('Added by you');
	await expect(aisle(page, 'Other')).toContainText(/qa paper towels/i);
	await gshot(page, CAP, 'add-an-extra-item');
	await page.getByLabel('Add an item').fill('2 qa paper towels');
	await add(page).click();
	await expect(row(page, 'qa paper towels')).toHaveCount(2);
	await row(page, 'qa paper towels')
		.first()
		.getByRole('button', { pressed: false })
		.first()
		.click();
	await expect(progress(page)).toContainText(/^1 of 2/);
	await page.reload();
	await expect(progress(page)).toContainText(/^1 of 2/);
	await add(page).click();
	await expect(page.getByText(/enter an item/i)).toBeVisible();
	await expect(page.getByTestId('grocery-item')).toHaveCount(2);
	await gshot(page, CAP, 'blank-text');
	await page
		.getByRole('button', { name: /^More for qa paper towels/i })
		.first()
		.click();
	await page
		.getByRole('dialog')
		.filter({ visible: true })
		.getByRole('button', { name: 'Delete item' })
		.click();
	await expect(page.getByTestId('grocery-item')).toHaveCount(1);
	await page.reload();
	await expect(page.getByTestId('grocery-item')).toHaveCount(1);
	await gshot(page, CAP, 'delete-an-extra-item');
	for (const id of await extraIds(page))
		await postAction(page, '/grocery?/remove', { week: GW.extras, id });
});

test('Extra item limit and length', async ({ page }) => {
	await openGrocery(page, GW.limit);
	for (const id of await extraIds(page))
		await postAction(page, '/grocery?/remove', { week: GW.limit, id });
	for (let i = 0; i < 100; i++) {
		const res = await postAction(page, '/grocery?/add', {
			week: GW.limit,
			text: `qa-limit item ${i}`
		});
		expect(code(res)).toBeLessThan(300);
	}
	const over = await postAction(page, '/grocery?/add', {
		week: GW.limit,
		text: 'qa-limit item 101'
	});
	expect(code(over)).toBe(409);
	const long = await postAction(page, '/grocery?/add', { week: GW.limit, text: 'x'.repeat(201) });
	expect(code(long)).toBe(400);
	await page.reload();
	await expect(page.getByTestId('grocery-item')).toHaveCount(100);
	await page.getByLabel('Add an item').fill('qa-limit one too many');
	await add(page).click();
	await expect(page.getByText(/at most 100/)).toBeVisible();
	await gshot(page, CAP, 'extra-item-limit');
});

test('Other user: private list and extra item', async ({ page, other }) => {
	await openGrocery(page, GW.extraTick);
	await page.getByLabel('Add an item').fill('3 qa private thing');
	await add(page).click();
	await expect(row(page, 'qa private thing')).toBeVisible();
	const [id] = await extraIds(page);
	await openGrocery(other, GW.main);
	await expect(other.getByTestId('grocery-item')).toHaveCount(0);
	await expect(other.getByText('Nothing to buy yet')).toBeVisible();
	await openGrocery(other, GW.extraTick);
	await expect(other.getByText('qa private thing')).toHaveCount(0);
	await openGrocery(other, GW.aisleA);
	await expect(other.getByText(/gochujang/i)).toHaveCount(0);
	await gshot(other, CAP, 'other-users-week');
	const del = await postAction(other, '/grocery?/remove', { week: GW.extraTick, id });
	expect(code(del)).toBe(404);
	const tick = await postAction(other, '/grocery?/extraTick', {
		week: GW.extraTick,
		id,
		checked: 'true'
	});
	expect(code(tick)).toBe(404);
	await gshot(other, CAP, 'other-users-extra-item');
	await openGrocery(page, GW.extraTick);
	await expect(row(page, 'qa private thing')).toBeVisible();
	for (const x of await extraIds(page))
		await postAction(page, '/grocery?/remove', { week: GW.extraTick, id: x });
});

test('Layout on a phone', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await openGrocery(page, GW.main);
	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth - window.innerWidth
	);
	expect(overflow).toBeLessThanOrEqual(1);
	await gshot(page, CAP, 'phone-layout');
	await page.getByRole('button', { name: /^More for onion/i }).click();
	await gshot(page, CAP, 'phone-item-menu');
});
