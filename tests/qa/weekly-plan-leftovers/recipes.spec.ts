// QA for the recipes capability of weekly-plan-leftovers (dev site).
import {
	addCook,
	addLeftover,
	cleanupRecipes,
	clearWeeks,
	createRecipe,
	entryIn,
	expect,
	open,
	openWeek,
	QA_PREFIX,
	shot,
	slot,
	test
} from './support';

const CAP = 'recipes';
const WK = '2031-08-11';
const planned = `${QA_PREFIX}rc-planned`;
const plain = `${QA_PREFIX}rc-plain`;
const cancelled = `${QA_PREFIX}rc-cancel`;
let plannedPath = '';

test('recipes exist for the recipes specs', async ({ page, browser }) => {
	await cleanupRecipes(browser);
	await clearWeeks(page, [WK]);
	plannedPath = await createRecipe(page, planned, 6);
	await createRecipe(page, plain, 2);
	await createRecipe(page, cancelled, 2);
});

test('Confirm delete', async ({ page }) => {
	await open(page, '/recipes');
	await page.getByRole('link', { name: new RegExp(plain) }).click();
	await page.waitForURL(/\/recipes\/[^/]+$/);
	const path = new URL(page.url()).pathname;
	await page.getByRole('button', { name: 'Delete', exact: true }).click();
	await expect(page.getByText('Delete this recipe?')).toBeVisible();
	await expect(page.getByText(/planned meal/)).toHaveCount(0);
	await page.getByRole('button', { name: 'Delete recipe' }).click();
	await expect(page).toHaveURL(/\/recipes$/);
	await expect(page.getByRole('link', { name: new RegExp(plain) })).toHaveCount(0);
	await open(page, path);
	await expect(page.getByText('We could not find that')).toBeVisible();
	await shot(page, CAP, 'confirm-delete');
});

test('Cancel delete', async ({ page }) => {
	await open(page, '/recipes');
	await page.getByRole('link', { name: new RegExp(cancelled) }).click();
	await page.getByRole('button', { name: 'Delete', exact: true }).click();
	await page.getByRole('button', { name: 'Cancel' }).click();
	await expect(page.getByRole('heading', { name: cancelled })).toBeVisible();
	await shot(page, CAP, 'cancel-delete');
});

test('Delete a recipe that is on the plan', async ({ page }) => {
	await openWeek(page, WK);
	await addCook(page, 'Mon dinner', planned, 6, 2);
	await addLeftover(page, 'Tue lunch', planned, 1);
	await addLeftover(page, 'Wed lunch', planned, 2);
	await expect(page.getByTestId('plan-entry').filter({ visible: true })).toHaveCount(3);
	await open(page, plannedPath);
	await page.getByRole('button', { name: 'Delete', exact: true }).click();
	const confirm = page.getByRole('dialog');
	await expect(confirm).toContainText('It is on 3 planned meals');
	await shot(page, CAP, 'delete-a-recipe-that-is-on-the-plan');
	await confirm.getByRole('button', { name: 'Delete recipe' }).click();
	await expect(page).toHaveURL(/\/recipes$/);
	await open(page, plannedPath);
	await expect(page.getByText('We could not find that')).toBeVisible();
	await openWeek(page, WK);
	await expect(page.getByTestId('plan-entry').filter({ visible: true })).toHaveCount(0);
	await expect(page.getByText(planned)).toHaveCount(0);
	await open(page, '/leftovers');
	await expect(page.getByText(planned)).toHaveCount(0);
	await openWeek(page, WK);
	await shot(page, CAP, 'plan-and-leftovers-after-delete');
	void entryIn;
	void slot;
});

test('cleanup qa data', async ({ browser }) => {
	await cleanupRecipes(browser);
});
