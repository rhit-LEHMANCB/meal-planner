import {
	test,
	expect,
	W,
	shot,
	openWeek,
	addCook,
	addLeftover,
	addDays,
	entryIn,
	clearWeeks
} from './support';
import { createRecipe, expectDayKcal, own, planDayKcal, planFood } from './fixtures';

const CAP = 'meal-plan';
test.describe.configure({ mode: 'serial' });

const mon = W.plan; // 2031-03-31
const d = (n: number) => addDays(mon, n);

test.beforeAll(async ({ browser }) => {
	const { stateFor } = await import('../weekly-plan-leftovers/support');
	const context = await browser.newContext({ storageState: await stateFor(browser, 'user') });
	await clearWeeks(await context.newPage(), [mon]);
	await context.close();
});

test('Day total', async ({ page }) => {
	await openWeek(page, mon);
	await addCook(page, 'Mon dinner', 'qa-nut-full', 1, 1);
	await planFood(page, 'Mon snack', 'qa-nut-snack', '170');
	// 1 serving of 230 kcal + 170 g at 97 kcal/100 g (164.9) = 395 kcal.
	await expectDayKcal(page, d(0), 395);
	expect((await planDayKcal(page, d(0)))?.partial).toBe(false);
	await shot(page, CAP, 'day-total', page.getByLabel('Week grid'));
});

test('Total follows changes', async ({ page }) => {
	await openWeek(page, mon);
	await expectDayKcal(page, d(0), 395);
	await entryIn(page, 'Mon snack', 'qa-nut-snack')
		.getByRole('button', { name: /^Remove/ })
		.click();
	await expectDayKcal(page, d(0), 230);
	await page.reload();
	await expectDayKcal(page, d(0), 230);
	await shot(page, CAP, 'total-follows-changes', page.getByLabel('Week grid'));
});

test('Partial day', async ({ page }) => {
	await openWeek(page, mon);
	await addCook(page, 'Tue dinner', 'qa-nut-partial', 3, 1);
	await expectDayKcal(page, d(1), 330);
	const day = await planDayKcal(page, d(1));
	expect(day?.partial).toBe(true);
	await expect(day!.header).toContainText('partial');
	await shot(page, CAP, 'partial-day', page.getByLabel('Week grid'));
});

test('Day with a cook, a leftover and a food', async ({ page }) => {
	await openWeek(page, mon);
	await addCook(page, 'Thu lunch', 'qa-nut-full', 4, 1);
	await addLeftover(page, 'Thu dinner', 'qa-nut-full', 2);
	await planFood(page, 'Thu snack', 'qa-nut-snack', '170');
	// 230 (cook, 1 serving) + 460 (leftover, 2 servings) + 164.9 (food) = 855.
	await expectDayKcal(page, d(3), 855);
	expect((await planDayKcal(page, d(3)))?.partial).toBe(false);
	await shot(page, CAP, 'day-with-a-cook-a-leftover-and-a-food', page.getByLabel('Week grid'));
});

test('Recipe edited after planning', async ({ page }) => {
	await createRecipe(page, 'qa-nut-edit', 1, [
		{ amount: '100', unit: 'g', name: 'qa-nut-rice', link: own('qa-nut-rice') }
	]);
	const recipeUrl = page.url();
	await openWeek(page, mon);
	await addCook(page, 'Fri dinner', 'qa-nut-edit', 1, 1);
	await expectDayKcal(page, d(4), 130);

	await page.goto(recipeUrl);
	await page.getByRole('link', { name: 'Edit', exact: true }).click();
	await page.locator('html[data-hydrated="true"]').waitFor();
	await page.getByRole('button', { name: 'Add ingredient' }).click();
	const rows = page.locator('[data-row]');
	const rowNo = Number(await rows.last().getAttribute("data-row"));
	await page.getByLabel(`Amount, row ${rowNo}`).fill('100');
	await page.getByLabel(`Unit, row ${rowNo}`).fill('g');
	await page.getByLabel(`Name, row ${rowNo}`).fill('qa-nut-chicken');
	await page.getByLabel(`Name, row ${rowNo}`).blur();
	await page.getByRole('button', { name: `Match food, row ${rowNo}` }).click();
	const input = page.getByLabel(`Find a food for row ${rowNo}`);
	await input.fill('qa-nut-chicken');
	await input.press('Enter');
	await page
		.getByRole('list', { name: `Foods for row ${rowNo}` })
		.getByRole('button')
		.filter({ hasText: 'qa-nut-chicken' })
		.first()
		.click();
	await page.getByRole('button', { name: /^Save changes/ }).click();
	await expect(page.getByRole('heading', { name: 'qa-nut-edit', exact: true })).toBeVisible();

	await openWeek(page, mon);
	await expectDayKcal(page, d(4), 295);
	await shot(page, CAP, 'recipe-edited-after-planning', page.getByLabel('Week grid'));
});

test('Days with no entries show no total, and logged entries are not on the plan', async ({
	page
}) => {
	await openWeek(page, mon);
	expect(await planDayKcal(page, d(6))).toBeNull(); // Sunday
	expect(await planDayKcal(page, d(5))).toBeNull(); // Saturday
	// Log an entry on Saturday from the Nutrition page.
	const { open } = await import('./support');
	const { logFood } = await import('./fixtures');
	await open(page, `/nutrition?week=${mon}`);
	await logFood(page, d(5), 'qa-nut-snack', 'qa-nut-snack', '100');
	await openWeek(page, mon);
	expect(await planDayKcal(page, d(5))).toBeNull();
	await shot(page, CAP, 'day-with-no-entries-shows-no-total', page.getByLabel('Week grid'));
	// Mobile list: the same totals appear for each day.
	await page.setViewportSize({ width: 390, height: 844 });
	await page.reload();
	await page.locator('html[data-hydrated="true"]').waitFor();
	await expect(page.locator('[data-day-kcal]:visible').first()).toBeVisible();
	await shot(page, CAP, 'phone-day-list');
});

test.afterAll(async ({ browser }) => {
	const { stateFor } = await import('../weekly-plan-leftovers/support');
	const { clearLogs } = await import('./fixtures');
	const context = await browser.newContext({ storageState: await stateFor(browser, 'user') });
	const page = await context.newPage();
	await clearLogs(page, [mon]);
	await clearWeeks(page, [mon]);
	await context.close();
});
