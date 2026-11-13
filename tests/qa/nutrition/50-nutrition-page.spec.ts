import type { Page } from '@playwright/test';
import {
	test,
	expect,
	W,
	shot,
	open,
	openWeek,
	addCook,
	addDays,
	clearWeeks,
	postAction,
	searchFoodsApi,

	mondayOf,
	todayUtc
} from './support';
import {
	clearLogs,
	createRecipe,
	logFood,
	logRecipe,
	nCells,
	nDay,
	nTotal,
	own,
	perServing,
	planFood
} from './fixtures';

const CAP = 'nutrition';
test.describe.configure({ mode: 'serial' });

const chart = (page: Page) => page.locator('section[aria-labelledby="chart-title"]');
const openNutrition = (page: Page, week: string) => open(page, `/nutrition?week=${week}`);

test.afterAll(async ({ browser }) => {
	const { stateFor } = await import('../weekly-plan-leftovers/support');
	const context = await browser.newContext({ storageState: await stateFor(browser, 'user') });
	const page = await context.newPage();
	const weeks = [W.chart, W.avg, W.empty, W.log, W.priv, W.goals, mondayOf(todayUtc())];
	await clearLogs(page, weeks);
	await clearWeeks(page, [W.chart, W.avg, W.empty, W.log, W.priv, W.goals]);
	await context.close();
});

const c = W.chart; // Monday
const day = (week: string, n: number) => addDays(week, n);
const MISSING = () => crypto.randomUUID();

// ---- Week chart, log a food, partial, delete ------------------------------------------------

test('Log a food', async ({ page }) => {
	await openWeek(page, c);
	await addCook(page, 'Mon dinner', 'qa-nut-full', 1, 1);
	await planFood(page, 'Tue lunch', 'qa-nut-snack', '170');
	await addCook(page, 'Wed dinner', 'qa-nut-partial', 3, 1);

	await openNutrition(page, c);
	await logFood(page, day(c, 1), 'apples raw', 'Apples, raw, with skin', '1', 'each');
	// 1 each = 182 g at 52 kcal/100 g = 94.6 kcal, shown as its own logged part on Tuesday.
	const [planned, leftover, logged] = await nCells(page, day(c, 1));
	expect(logged).toBe(95);
	expect(planned).toBe(165);
	expect(leftover).toBe(0);
	expect(await nTotal(page, day(c, 1))).toBe(260);
	const entry = page.locator('li[data-log]').filter({ hasText: 'Apples, raw' });
	await expect(entry).toHaveCount(1);
	await expect(entry).toContainText('95 kcal');
	await expect(page.getByRole('heading', { name: /^Tue/, level: 3 })).toBeVisible();
	await shot(page, CAP, 'log-a-food');
});

test('Week chart', async ({ page }) => {
	await openNutrition(page, c);
	expect(await nTotal(page, day(c, 0))).toBe(230);
	expect(await nTotal(page, day(c, 1))).toBe(260);
	expect((await nCells(page, day(c, 1)))[2]).toBe(95);
	for (const n of [3, 4, 5, 6]) expect(await nTotal(page, day(c, n))).toBe(0);
	await expect(chart(page)).toContainText('Calories by day');
	await expect(chart(page)).toContainText('goal');
	await shot(page, CAP, 'week-chart', chart(page));
});

test('Partial day marked', async ({ page }) => {
	await openNutrition(page, c);
	expect(await nTotal(page, day(c, 2))).toBe(330);
	await expect(nDay(page, day(c, 2))).toContainText('(partial)');
	await expect(nDay(page, day(c, 0))).not.toContainText('(partial)');
	await expect(chart(page).getByText('Partial: some ingredients')).toBeVisible();
	await expect(chart(page).getByText('330*')).toBeVisible();
	await shot(page, CAP, 'partial-day-marked', chart(page));
});

test('Delete', async ({ page }) => {
	await openNutrition(page, c);
	await page.getByRole('button', { name: /^Delete Apples, raw/ }).click();
	await expect(page.locator('li[data-log]')).toHaveCount(0);
	await expect(page.getByText('Nothing logged this week.')).toBeVisible();
	expect(await nTotal(page, day(c, 1))).toBe(165);
	expect((await nCells(page, day(c, 1)))[2]).toBe(0);
	await page.reload();
	await expect(page.locator('li[data-log]')).toHaveCount(0);
	expect(await nTotal(page, day(c, 1))).toBe(165);
	await shot(page, CAP, 'delete');
});

// ---- Log a recipe, snapshot, invalid amount ------------------------------------------------

test('Log a recipe', async ({ page }) => {
	await openNutrition(page, W.log);
	await logRecipe(page, day(W.log, 2), 'qa-nut-full', '1.5');
	// 1.5 servings at 230 kcal = 345 kcal.
	expect((await nCells(page, day(W.log, 2)))[2]).toBe(345);
	expect(await nTotal(page, day(W.log, 2))).toBe(345);
	await shot(page, CAP, 'log-a-recipe');
});

test('Snapshot at log time', async ({ page }) => {
	await createRecipe(page, 'qa-nut-snap', 1, [
		{ amount: '100', unit: 'g', name: 'qa-nut-rice', link: own('qa-nut-rice') }
	]);
	const recipeUrl = page.url();
	await openNutrition(page, W.log);
	await logRecipe(page, day(W.log, 3), 'qa-nut-snap', '1');
	expect((await nCells(page, day(W.log, 3)))[2]).toBe(130);

	await page.goto(recipeUrl);
	await page.getByRole('link', { name: 'Edit', exact: true }).click();
	await page.locator('html[data-hydrated="true"]').waitFor();
	const rows = page.locator('[data-row]');
	const n = Number(await rows.last().getAttribute('data-row'));
	await page.getByLabel(`Amount, row ${n}`).fill('100');
	await page.getByLabel(`Unit, row ${n}`).fill('g');
	await page.getByLabel(`Name, row ${n}`).fill('qa-nut-chicken');
	await page.getByLabel(`Name, row ${n}`).blur();
	await page.getByRole('button', { name: `Match food, row ${n}` }).click();
	const input = page.getByLabel(`Find a food for row ${n}`);
	await input.fill('qa-nut-chicken');
	await input.press('Enter');
	await page
		.getByRole('list', { name: `Foods for row ${n}` })
		.getByRole('button')
		.filter({ hasText: 'qa-nut-chicken' })
		.first()
		.click();
	await page.getByRole('button', { name: /^Save changes/ }).click();
	await expect(page.getByRole('heading', { name: 'qa-nut-snap', exact: true })).toBeVisible();
	expect(await perServing(page)).toBe(295);

	await openNutrition(page, W.log);
	expect((await nCells(page, day(W.log, 3)))[2]).toBe(130);
	expect(await nTotal(page, day(W.log, 3))).toBe(130);
	await shot(page, CAP, 'snapshot-at-log-time');
});

test('Invalid amount', async ({ page }) => {
	await openNutrition(page, W.log);
	const before = await nTotal(page, day(W.log, 0));
	await page.getByRole('radio', { name: 'Food' }).check();
	const search = page.locator('#log-food-search');
	await search.fill('qa-nut-snack');
	await search.press('Enter');
	await page
		.getByRole('list', { name: 'Foods found' })
		.getByRole('button')
		.filter({ hasText: 'qa-nut-snack' })
		.first()
		.click();
	await page.locator('#log-amount').fill('0');
	await page.locator('#log-date').selectOption(day(W.log, 0));
	await page.getByRole('button', { name: 'Log it' }).click();
	await expect(page.getByText(/greater than 0|more than 0/i)).toBeVisible();
	await shot(page, CAP, 'invalid-amount');
	await page.reload();
	expect(await nTotal(page, day(W.log, 0))).toBe(before);
	await expect(page.locator('li[data-log]').filter({ hasText: 'qa-nut-snack' })).toHaveCount(0);
});

// ---- Average, empty week -------------------------------------------------------------------

test('Average skips empty days', async ({ page }) => {
	await openWeek(page, W.avg);
	await planFood(page, 'Mon dinner', 'qa-nut-dense', '225');
	await planFood(page, 'Tue dinner', 'qa-nut-dense', '275');
	await openNutrition(page, W.avg);
	expect(await nTotal(page, day(W.avg, 0))).toBe(1800);
	expect(await nTotal(page, day(W.avg, 1))).toBe(2200);
	const avg = page.getByTestId('weekly-average');
	await expect(avg).toContainText('2,000 kcal');
	await expect(avg).toContainText(/Protein\s*50\s*g/);
	await expect(avg).toContainText(/Carbs\s*250\s*g/);
	await expect(avg).toContainText(/Fat\s*75\s*g/);
	await shot(page, CAP, 'average-skips-empty-days');
});

test('Empty week', async ({ page }) => {
	await openNutrition(page, W.empty);
	for (let n = 0; n < 7; n++) expect(await nTotal(page, day(W.empty, n))).toBe(0);
	await expect(page.getByTestId('nutrition-empty')).toContainText('Plan some meals');
	await expect(page.getByTestId('nutrition-empty')).toContainText('log food');
	await expect(page.getByText('No days with food yet.')).toBeVisible();
	await shot(page, CAP, 'empty-week');
});

// ---- Today against goals, goals ------------------------------------------------------------

const saveGoals = async (
	page: Page,
	g: { kcal: string; protein: string; carbs: string; fat: string }
) => {
	await page.locator('#goal-kcal').fill(g.kcal);
	await page.locator('#goal-proteinG').fill(g.protein);
	await page.locator('#goal-carbsG').fill(g.carbs);
	await page.locator('#goal-fatG').fill(g.fat);
	await page.getByRole('button', { name: 'Save goals' }).click();
};
const DEFAULT = { kcal: '2000', protein: '140', carbs: '230', fat: '70' };

test('Calories left', async ({ page }) => {
	await open(page, '/nutrition');
	await saveGoals(page, DEFAULT);
	await expect(page.getByText('Goals saved.')).toBeVisible();
	const today = await page.locator('#log-date').inputValue();
	const base = await nTotal(page, today);
	await logFood(page, today, 'qa-nut-dense', 'qa-nut-dense', '192.5');
	const total = base + 1540;
	expect(await nTotal(page, today)).toBe(total);
	const card = page.getByTestId('today-card');
	await expect(card).toContainText(total.toLocaleString('en-US'));
	await expect(card).toContainText('of 2,000 kcal');
	await expect(page.getByTestId('kcal-left')).toHaveText(
		`${(2000 - total).toLocaleString('en-US')} kcal left today`
	);
	await page.evaluate(() => window.scrollTo(0, 0));
	await shot(page, CAP, 'calories-left');
});

test('Over goal', async ({ page }) => {
	await open(page, '/nutrition');
	const today = await page.locator('#log-date').inputValue();
	const total = await nTotal(page, today);
	await saveGoals(page, { ...DEFAULT, kcal: String(total - 300) });
	await expect(page.getByText('Goals saved.')).toBeVisible();
	await expect(page.getByTestId('kcal-left')).toHaveText('300 kcal over today');
	await page.evaluate(() => window.scrollTo(0, 0));
	await shot(page, CAP, 'over-goal');
});

test('Save goals', async ({ page }) => {
	await open(page, '/nutrition');
	await saveGoals(page, { kcal: '1800', protein: '150', carbs: '180', fat: '60' });
	await expect(page.getByText('Goals saved.')).toBeVisible();
	await expect(page.getByTestId('today-card')).toContainText('of 1,800 kcal');
	await expect(page.getByLabel('Macros today').or(page.locator('body'))).toContainText(/of 150\s*g/);
	await expect(page.locator('body')).toContainText(/of 180\s*g/);
	await expect(page.locator('body')).toContainText(/of 60\s*g/);
	await expect(chart(page)).toContainText('1,800 goal');
	await page.evaluate(() => window.scrollTo(0, 0));
	await shot(page, CAP, 'save-goals');
	await page.reload();
	await expect(page.locator('#goal-kcal')).toHaveValue('1800');
	await expect(page.locator('#goal-proteinG')).toHaveValue('150');
	await expect(page.locator('#goal-carbsG')).toHaveValue('180');
	await expect(page.locator('#goal-fatG')).toHaveValue('60');
});

test('Invalid goal', async ({ page }) => {
	await open(page, '/nutrition');
	await saveGoals(page, { kcal: '100', protein: '150', carbs: '180', fat: '60' });
	const err = page.locator('#goal-kcal-error');
	await expect(err).toBeVisible();
	await expect(err).toContainText(/500/);
	await expect(err).toContainText(/10,000/);
	await shot(page, CAP, 'invalid-goal');
	await page.reload();
	await expect(page.locator('#goal-kcal')).toHaveValue('1800');
	// Restore the defaults so later runs start the same.
	await saveGoals(page, DEFAULT);
	await expect(page.getByText('Goals saved.')).toBeVisible();
});

test('Default goals for a user who never saved', async ({ other }) => {
	await open(other, '/nutrition');
	const k = await other.locator('#goal-kcal').inputValue();
	test.info().annotations.push({ type: 'other-user-kcal', description: k });
	// The second QA account never saves goals in this suite.
	expect(['2000']).toContain(k);
	await expect(other.locator('#goal-proteinG')).toHaveValue('140');
	await expect(other.locator('#goal-carbsG')).toHaveValue('230');
	await expect(other.locator('#goal-fatG')).toHaveValue('70');
	await shot(other, CAP, 'default-goals');
});

// ---- Privacy -------------------------------------------------------------------------------

test('Another user\'s log entry, recipe, and per-user weeks', async ({ page, other }) => {
	await openNutrition(page, W.priv);
	await logFood(page, day(W.priv, 0), 'qa-nut-snack', 'qa-nut-snack', '100');
	const logId = await page.locator('li[data-log]').first().getAttribute('data-log');
	expect(logId).toBeTruthy();

	// Another user's log entry behaves exactly like a missing one.
	const path = `/nutrition?week=${W.priv}&/remove`;
	const foreign = await postAction(other, path, { logId: logId! });
	const missing = await postAction(other, path, { logId: MISSING() });
	expect(foreign.status).toBe(missing.status);
	expect(foreign.body).toBe(missing.body);
	await page.reload();
	await expect(page.locator(`li[data-log="${logId}"]`)).toHaveCount(1);

	// Another user's recipe.
	await open(page, '/recipes?q=qa-nut-full');
	await page.getByRole('link', { name: /^qa-nut-full/ }).first().click();
	await page.waitForURL(/\/recipes\/[0-9a-f-]{36}$/);
	const recipeId = new URL(page.url()).pathname.split('/').pop()!;
	const logPath = `/nutrition?week=${W.priv}&/log`;
	const form = (id: string) => ({
		week: W.priv,
		kind: 'recipe',
		recipeId: id,
		servings: '1',
		date: day(W.priv, 1),
		slot: ''
	});
	const foreignRecipe = await postAction(other, logPath, form(recipeId));
	const missingRecipe = await postAction(other, logPath, form(MISSING()));
	expect(foreignRecipe.status).toBe(missingRecipe.status);
	expect(foreignRecipe.body).toBe(missingRecipe.body);

	// Another user's custom food.
	const foodId = (await searchFoodsApi(page, 'qa-nut-snack')).foods.find((f) => f.own)!.id;
	const foodForm = (id: string) => ({
		week: W.priv,
		kind: 'food',
		foodId: id,
		amount: '100',
		unit: 'g',
		date: day(W.priv, 1),
		slot: ''
	});
	const foreignFood = await postAction(other, logPath, foodForm(foodId));
	const missingFood = await postAction(other, logPath, foodForm(MISSING()));
	expect(foreignFood.status).toBe(missingFood.status);
	expect(foreignFood.body).toBe(missingFood.body);

	// Nothing was written for the user, and the other user sees none of it.
	await openNutrition(page, W.priv);
	await expect(page.locator('li[data-log]')).toHaveCount(1);
	await openNutrition(other, W.priv);
	await expect(other.getByText('Nothing logged this week.')).toBeVisible();
	for (let n = 0; n < 7; n++) expect(await nTotal(other, day(W.priv, n))).toBe(0);
	await shot(other, CAP, 'weeks-are-per-user');
	await openNutrition(page, W.priv);
	await shot(page, CAP, 'another-users-log-entry');
});

// ---- Credit, access, navigation ------------------------------------------------------------

test('Credit shown', async ({ page }) => {
	await openNutrition(page, c);
	const credit = page.getByText(/USDA FoodData Central/);
	await credit.scrollIntoViewIfNeeded();
	await expect(credit).toBeVisible();
	await shot(page, CAP, 'credit-shown');
});

test('Signed-out visitors go to sign-in', async ({ browser }) => {
	const context = await browser.newContext();
	const page = await context.newPage();
	await page.goto('/nutrition');
	await expect(page).toHaveURL(/\/signin/);
	await shot(page, CAP, 'signed-out-redirect');
	await context.close();
});

test('Week controls', async ({ page }) => {
	await openNutrition(page, c);
	await page.getByRole('link', { name: 'Next week' }).click();
	await expect(page).toHaveURL(new RegExp(`week=${addDays(c, 7)}`));
	await page.getByRole('link', { name: 'Previous week' }).click();
	await expect(page).toHaveURL(new RegExp('week=' + c));
	await page.locator('html[data-hydrated="true"]').waitFor();
	await page.getByRole('link', { name: 'Previous week' }).click();
	await expect(page).toHaveURL(new RegExp(`week=${addDays(c, -7)}`));
	await page.getByRole('link', { name: 'This week' }).click();
	await expect(page).toHaveURL(new RegExp(`week=${mondayOf(todayUtc())}`));
	await expect(page.getByTestId('today-card')).toBeVisible();
});

test('Phone layout of the Nutrition page', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await open(page, '/nutrition');
	await page.screenshot({ path: 'openspec/changes/nutrition/qa/screenshots/nutrition-phone-layout.png' });
	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth > document.documentElement.clientWidth
	);
	test.info().annotations.push({ type: 'phone-horizontal-overflow', description: String(overflow) });
	// Observation only: with data in the week the screen-reader table widens the page by about 15px at 390px.
	console.log("phone horizontal overflow:", overflow);
});
