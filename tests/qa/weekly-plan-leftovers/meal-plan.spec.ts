// QA for the meal-plan capability of weekly-plan-leftovers (dev site).
import {
	addCook,
	addExistingFood,
	addLeftover,
	cleanupRecipes,
	createFood,
	createRecipe,
	dialog,
	entryIn,
	expect,
	FAKE_ID,
	mondayOf,
	open,
	openAdd,
	openWeek,
	postAction,
	QA_PREFIX,
	clearWeeks,
	FRUN,
	RUN,
	searchFoodsApi,
	shot,
	slot,
	stateFor,
	test,
	todayUtc,
	WEEKS
} from './support';

// Run in order but keep going after a failure, so one bug does not hide the rest.
test.describe.configure({ mode: 'default' });

const CAP = 'meal-plan';
const chili = `${QA_PREFIX}mp-chili-${RUN}`;
const pasta = `${QA_PREFIX}mp-pasta-${RUN}`;
const stew = `${QA_PREFIX}mp-stew-${RUN}`;
const roast = `${QA_PREFIX}mp-roast-${RUN}`;
const yogurt = `${QA_PREFIX}mp-yogurt-${FRUN}`;
const greens = `${QA_PREFIX}mp-greens-${FRUN}`;
const visibleEntries = (page: import('@playwright/test').Page) =>
	page.getByTestId('plan-entry').filter({ visible: true });

test('recipes exist for the plan specs', async ({ page, browser }) => {
	await cleanupRecipes(browser);
	await clearWeeks(page, [WEEKS.a, WEEKS.b, WEEKS.c, WEEKS.d, WEEKS.e, WEEKS.f, WEEKS.g]);
	await createRecipe(page, chili, 6);
	await createRecipe(page, pasta, 4);
	await createRecipe(page, roast, 4);
	await createRecipe(page, stew, 6);
});

test('Open the plan', async ({ page }) => {
	await open(page, '/plan');
	await expect(page).toHaveURL(/\/plan(\?week=\d{4}-\d{2}-\d{2})?$/);
	await expect(page.getByRole('group').filter({ visible: true })).toHaveCount(28);
	for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
		for (const s of ['breakfast', 'lunch', 'dinner', 'snack'])
			await expect(slot(page, `${day} ${s}`)).toHaveCount(1);
	await expect(page.locator('[aria-current="date"]').filter({ visible: true })).toHaveCount(1);
	await expect(page.getByRole('link', { name: 'This week' })).toHaveAttribute(
		'aria-current',
		'page'
	);
	await shot(page, CAP, 'open-the-plan');
});

test('Week in the address', async ({ page }) => {
	await open(page, '/plan?week=2031-03-05');
	await expect(page).toHaveURL(/week=2031-03-03$/);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mar 3 – 9');
	await shot(page, CAP, 'week-in-the-address');
});

test('Invalid week', async ({ page }) => {
	await open(page, '/plan?week=not-a-date');
	await expect(page.getByRole('link', { name: 'This week' })).toHaveAttribute(
		'aria-current',
		'page'
	);
	await expect(page.getByRole('group').filter({ visible: true })).toHaveCount(28);
	await shot(page, CAP, 'invalid-week');
});

test('Signed-out visitor', async ({ browser }) => {
	const context = await browser.newContext();
	const page = await context.newPage();
	await open(page, '/plan');
	await expect(page).toHaveURL(/\/signin$/);
	await shot(page, CAP, 'signed-out-visitor');
	await context.close();
});

test('Next week', async ({ page }) => {
	await openWeek(page, WEEKS.a);
	await page.getByRole('link', { name: 'Next week' }).click();
	await expect(page).toHaveURL(/week=2031-03-10$/);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mar 10 – 16');
	await shot(page, CAP, 'next-week');
});

test('Back to this week', async ({ page }) => {
	await openWeek(page, WEEKS.a);
	await page.getByRole('link', { name: 'This week' }).click();
	await expect(page).toHaveURL(new RegExp(`week=${mondayOf(todayUtc())}$`));
	await expect(page.getByRole('link', { name: 'This week' })).toHaveAttribute(
		'aria-current',
		'page'
	);
	await shot(page, CAP, 'back-to-this-week');
});

test('Open the dialog', async ({ page }) => {
	await openWeek(page, WEEKS.a);
	await openAdd(page, 'Tue dinner');
	for (const t of ['Recipe', 'Leftover', 'Food'])
		await expect(dialog(page).getByRole('tab', { name: t })).toBeVisible();
	await shot(page, CAP, 'open-the-dialog');
	// Keyboard: arrow keys move between tabs.
	await dialog(page).getByRole('tab', { name: 'Recipe' }).focus();
	await page.keyboard.press('ArrowRight');
	await expect(dialog(page).getByRole('tab', { name: 'Leftover' })).toHaveAttribute(
		'aria-selected',
		'true'
	);
});

test('Cancel', async ({ page }) => {
	await openWeek(page, WEEKS.a);
	await openAdd(page, 'Tue dinner');
	await dialog(page).getByLabel('Search recipes').fill(pasta);
	await dialog(page)
		.getByRole('radio', { name: new RegExp(pasta) })
		.check();
	await dialog(page).getByLabel('Servings to cook').fill('3');
	await page.keyboard.press('Escape');
	await expect(dialog(page)).toHaveCount(0);
	await expect(visibleEntries(page)).toHaveCount(0);
	await page.reload();
	await expect(visibleEntries(page)).toHaveCount(0);
	await shot(page, CAP, 'cancel');
});

test('Add a cook', async ({ page }) => {
	await openWeek(page, WEEKS.a);
	await addCook(page, 'Mon dinner', chili, 6, 2);
	await expect(entryIn(page, 'Mon dinner', chili)).toContainText('cook 6 · eat 2');
	await page.reload();
	await expect(entryIn(page, 'Mon dinner', chili)).toContainText('cook 6 · eat 2');
	await shot(page, CAP, 'add-a-cook');
});

test('Eaten more than cooked', async ({ page }) => {
	await openWeek(page, WEEKS.b);
	await openAdd(page, 'Mon dinner');
	await dialog(page).getByLabel('Search recipes').fill(pasta);
	await dialog(page)
		.getByRole('radio', { name: new RegExp(pasta) })
		.check();
	await dialog(page).getByLabel('Servings to cook').fill('2');
	await dialog(page).getByLabel('Eaten at this meal').fill('3');
	await dialog(page).getByRole('button', { name: 'Add cook' }).click();
	await expect(dialog(page).locator('#add-error-eaten')).toBeVisible();
	await expect(dialog(page).getByLabel('Eaten at this meal')).toHaveAttribute(
		'aria-invalid',
		'true'
	);
	await shot(page, CAP, 'eaten-more-than-cooked');
	await page.keyboard.press('Escape');
	await page.reload();
	await expect(visibleEntries(page)).toHaveCount(0);
});

test("Someone else's recipe", async ({ page, other }) => {
	await open(other, '/recipes/new');
	const otherTitle = `${QA_PREFIX}mp-other-${RUN}`;
	await other.getByLabel('Title').fill(otherTitle);
	await other.getByLabel('Servings').fill('4');
	await other.getByLabel('Paste ingredient lines').fill('1 cup rice');
	await other.getByRole('button', { name: 'Save recipe' }).click();
	await expect(other.getByRole('heading', { name: otherTitle })).toBeVisible();
	const otherPath = new URL(other.url()).pathname;
	const otherId = otherPath.split('/').pop()!;
	try {
		await openWeek(page, WEEKS.b);
		const fields = (id: string) => ({
			date: WEEKS.b,
			slot: 'dinner',
			recipeId: id,
			cooked: '4',
			eaten: '2'
		});
		const foreign = await postAction(page, '/plan?/addCook', fields(otherId));
		const missing = await postAction(page, '/plan?/addCook', fields(FAKE_ID));
		console.log('foreign recipe', foreign.status, foreign.body.slice(0, 200));
		expect(foreign.status).toBe(missing.status);
		expect(foreign.body).toBe(missing.body);
		await page.reload();
		await expect(visibleEntries(page)).toHaveCount(0);
		// the recipe picker never offers it
		await openAdd(page, 'Mon dinner');
		await dialog(page).getByLabel('Search recipes').fill(otherTitle);
		await expect(dialog(page).getByText('No recipes match')).toBeVisible();
		await shot(page, CAP, 'someone-elses-recipe');
	} finally {
		await open(other, otherPath);
		await other.getByRole('button', { name: 'Delete', exact: true }).click();
		await other.getByRole('button', { name: 'Delete recipe' }).click();
		await expect(other).toHaveURL(/\/recipes$/);
	}
});

test('Add a food in grams', async ({ page }) => {
	await openWeek(page, WEEKS.c);
	await createFood(
		page,
		'Mon breakfast',
		yogurt,
		{ kcal: '97', protein: '9', carbs: '4', fat: '5' },
		'170'
	);
	await expect(entryIn(page, 'Mon breakfast', yogurt)).toContainText('170 g');
	await addExistingFood(page, 'Tue breakfast', yogurt, '120');
	await expect(entryIn(page, 'Tue breakfast', yogurt)).toContainText('120 g');
	await shot(page, CAP, 'add-a-food-in-grams');
});

test('Change a food amount', async ({ page }) => {
	await openWeek(page, WEEKS.c);
	await page
		.getByRole('button', { name: new RegExp(`^Edit ${yogurt}, Mon breakfast`) })
		.filter({ visible: true })
		.click();
	await dialog(page).getByLabel('Amount').fill('200');
	await dialog(page).getByRole('button', { name: 'Save changes' }).click();
	await expect(dialog(page)).toHaveCount(0);
	await expect(entryIn(page, 'Mon breakfast', yogurt)).toContainText('200 g');
	await shot(page, CAP, 'change-a-food-amount');
});

test('Unit the food does not have', async ({ page }) => {
	await openWeek(page, WEEKS.c);
	const food = (await searchFoodsApi(page, yogurt)).foods.find((f) => f.name === yogurt)!;
	expect(food.units).toEqual(['g']);
	const res = await postAction(page, '/plan?/addFood', {
		date: WEEKS.c,
		slot: 'dinner',
		foodId: food.id,
		amount: '2',
		unit: 'cup'
	});
	console.log('unit response', res.status, res.body.slice(0, 200));
	expect(res.body).toContain('"type":"failure"');
	expect(res.body).toContain('Choose a unit this food has');
	await page.reload();
	await expect(slot(page, 'Mon dinner').getByTestId('plan-entry')).toHaveCount(0);
	// the same through the UI: the unit list only offers g
	await openAdd(page, 'Mon dinner');
	await dialog(page).getByRole('tab', { name: 'Food' }).click();
	await dialog(page).getByLabel('Search foods').fill(yogurt);
	await dialog(page)
		.getByRole('radio', { name: new RegExp(yogurt) })
		.check();
	await dialog(page).getByLabel('Amount').fill('2');
	await expect(dialog(page).getByLabel('Unit').locator('option')).toHaveText(['g']);
	await shot(page, CAP, 'unit-the-food-does-not-have');
});

test('Two entries in one slot', async ({ page }) => {
	await openWeek(page, WEEKS.d);
	await addCook(page, 'Wed dinner', pasta, 4, 2);
	await createFood(
		page,
		'Wed dinner',
		greens,
		{ kcal: '20', protein: '2', carbs: '3', fat: '0' },
		'80'
	);
	await expect(slot(page, 'Wed dinner').getByTestId('plan-entry')).toHaveCount(2);
	await expect(entryIn(page, 'Wed dinner', pasta)).toBeVisible();
	await expect(entryIn(page, 'Wed dinner', greens)).toContainText('80 g');
	await expect(page.getByRole('button', { name: `Remove ${pasta}, Wed dinner` })).toBeVisible();
	await expect(page.getByRole('button', { name: `Remove ${greens}, Wed dinner` })).toBeVisible();
	await shot(page, CAP, 'two-entries-in-one-slot');
});

test('Drag a recipe to a slot', async ({ page }) => {
	await openWeek(page, WEEKS.e);
	const item = page.getByTestId('shelf-recipe').filter({ hasText: roast });
	await item.dragTo(slot(page, 'Sun lunch'));
	await expect(dialog(page).getByRole('heading', { name: 'Add to Sun lunch' })).toBeVisible();
	await expect(dialog(page).getByRole('tab', { name: 'Recipe' })).toHaveAttribute(
		'aria-selected',
		'true'
	);
	await expect(dialog(page).getByRole('radio', { name: new RegExp(roast) })).toBeChecked();
	await expect(visibleEntries(page)).toHaveCount(0);
	await shot(page, CAP, 'drag-a-recipe-to-a-slot');
	await page.reload();
	await expect(visibleEntries(page)).toHaveCount(0);
});

test('Cook fewer servings than are drawn', async ({ page }) => {
	await openWeek(page, WEEKS.f);
	await addCook(page, 'Mon dinner', stew, 6, 2);
	await addLeftover(page, 'Tue lunch', stew, 2);
	await addLeftover(page, 'Wed lunch', stew, 2);
	await page
		.getByRole('button', { name: new RegExp(`^Edit ${stew}, Mon dinner`) })
		.filter({ visible: true })
		.click();
	await dialog(page).getByLabel('Servings to cook').fill('5');
	await dialog(page).getByRole('button', { name: 'Save changes' }).click();
	await expect(dialog(page).getByText(/4 servings are already planned as leftovers/)).toBeVisible();
	await shot(page, CAP, 'cook-fewer-servings-than-are-drawn');
	await page.keyboard.press('Escape');
	await page.reload();
	await expect(entryIn(page, 'Mon dinner', stew)).toContainText('cook 6 · eat 2');
});

test('Remove a leftover', async ({ page }) => {
	await openWeek(page, WEEKS.f);
	const row = page.locator('section[aria-labelledby="fridge-title"] li').filter({ hasText: stew });
	await expect(row).toContainText('0 free');
	await page
		.getByRole('button', { name: `Remove leftover ${stew}, Tue lunch` })
		.filter({ visible: true })
		.click();
	await expect(entryIn(page, 'Tue lunch', stew)).toHaveCount(0);
	await expect(row).toContainText('2 free');
	await shot(page, CAP, 'remove-a-leftover');
});

test('Remove a cook with planned leftovers', async ({ page }) => {
	await openWeek(page, WEEKS.f);
	await addLeftover(page, 'Tue lunch', stew, 1);
	await page
		.getByRole('button', { name: `Remove ${stew}, Mon dinner` })
		.filter({ visible: true })
		.click();
	const confirm = page.getByRole('dialog', { name: new RegExp(`Remove ${stew}`) });
	await expect(confirm).toBeVisible();
	await expect(confirm).toContainText('Tue lunch');
	await expect(confirm).toContainText('Wed lunch');
	await shot(page, CAP, 'remove-a-cook-with-planned-leftovers');
	await confirm.getByRole('button', { name: 'Remove cook and leftovers' }).click();
	await expect(visibleEntries(page)).toHaveCount(0);
	await open(page, '/leftovers');
	await expect(page.getByText(stew)).toHaveCount(0);
});

test('Remove a cook with no planned leftovers', async ({ page }) => {
	await openWeek(page, WEEKS.g);
	await addCook(page, 'Mon dinner', roast, 4, 2);
	await page
		.getByRole('button', { name: `Remove ${roast}, Mon dinner` })
		.filter({ visible: true })
		.click();
	await expect(visibleEntries(page)).toHaveCount(0);
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await shot(page, CAP, 'remove-a-cook-with-no-planned-leftovers');
	await open(page, '/leftovers');
	await expect(page.getByTestId('leftover-batch').filter({ hasText: roast })).toHaveCount(0);
});

test('Phone layout', async ({ browser }) => {
	const context = await browser.newContext({
		storageState: await stateFor(browser, 'user'),
		viewport: { width: 390, height: 844 },
		isMobile: true,
		hasTouch: true
	});
	const page = await context.newPage();
	await openWeek(page, WEEKS.d);
	await expect(
		page.getByRole('heading', { level: 2 }).filter({ hasText: /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s/ })
	).toHaveCount(7);
	await expect(
		page.getByRole('button', { name: /^Add to / }).filter({ visible: true })
	).toHaveCount(28);
	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth - document.documentElement.clientWidth
	);
	expect(overflow).toBeLessThanOrEqual(0);
	await expect(page.getByRole('region', { name: 'Week grid' })).toBeHidden();
	await shot(page, CAP, 'phone-layout');
	// the actions work without drag-and-drop
	await openAdd(page, 'Tue dinner');
	await page.keyboard.press('Escape');
	await page.getByRole('button', { name: new RegExp(`^Edit ${pasta}`) }).click();
	await expect(dialog(page).getByRole('heading', { name: `Edit ${pasta}` })).toBeVisible();
	await page.keyboard.press('Escape');
	await page.getByRole('link', { name: 'Next week' }).click();
	await expect(page).toHaveURL(/week=2031-03-31$/);
	await context.close();
});

test("Another user's week", async ({ other }) => {
	await openWeek(other, WEEKS.d);
	await expect(visibleEntries(other)).toHaveCount(0);
	await expect(other.getByText(pasta)).toHaveCount(0);
	await expect(other.getByText(greens)).toHaveCount(0);
	await shot(other, CAP, 'another-users-week');
});

test("Another user's entry", async ({ page, other }) => {
	await openWeek(page, WEEKS.d);
	const entryId = await page
		.locator('form[action="?/removeEntry"] input[name=entryId]')
		.first()
		.inputValue();
	await openWeek(other, WEEKS.d);
	const upd = (id: string) => ({ entryId: id, kind: 'cook', cooked: '9', eaten: '1' });
	const foreignUpd = await postAction(other, '/plan?/updateEntry', upd(entryId));
	const missingUpd = await postAction(other, '/plan?/updateEntry', upd(FAKE_ID));
	const foreignDel = await postAction(other, '/plan?/removeEntry', { entryId, confirm: '1' });
	const missingDel = await postAction(other, '/plan?/removeEntry', {
		entryId: FAKE_ID,
		confirm: '1'
	});
	console.log(
		'foreign vs missing',
		foreignUpd.status,
		foreignDel.status,
		foreignUpd.body.slice(0, 150)
	);
	expect(foreignUpd).toEqual(missingUpd);
	expect(foreignDel).toEqual(missingDel);
	await page.reload();
	await expect(slot(page, 'Wed dinner').getByTestId('plan-entry')).toHaveCount(2);
	await expect(entryIn(page, 'Wed dinner', pasta)).toContainText('cook 4 · eat 2');
	await shot(page, CAP, 'another-users-entry');
});

test('cleanup qa data', async ({ page, browser }) => {
	await cleanupRecipes(browser);
	await clearWeeks(page, [WEEKS.a, WEEKS.b, WEEKS.c, WEEKS.d, WEEKS.e, WEEKS.f, WEEKS.g]);
});
