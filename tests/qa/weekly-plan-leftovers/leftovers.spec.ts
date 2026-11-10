// QA for the leftovers capability of weekly-plan-leftovers (dev site).
import type { Page } from '@playwright/test';
import {
	addCook,
	addDays,
	addLeftover,
	clearWeeks,
	cleanupRecipes,
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
	shot,
	slot,
	test,
	todayUtc,
	WEEKS
} from './support';

const CAP = 'leftovers';
const name = (s: string) => `${QA_PREFIX}lo-${s}`;
const R = {
	batch: name('chili'), // batch from a cook, add a leftover, chips, same-day later slot
	spareless: name('nothing-spare'),
	few: name('one-free'),
	race: name('race'),
	early: name('early'),
	late: name('late-eat'),
	fridge: name('lemon-pasta'),
	finished: name('finished'),
	stale: name('stale'),
	toss: name('discard'),
	tossPlanned: name('toss-planned'),
	keep: name('keep'),
	foreign: name('foreign')
};
const WK = {
	batch: WEEKS.h,
	spareless: WEEKS.i,
	few: WEEKS.j,
	race: WEEKS.k,
	early: WEEKS.l,
	late: WEEKS.m,
	fridge: WEEKS.n,
	toss: WEEKS.o,
	tossPlanned: WEEKS.p,
	keep: addDays(WEEKS.p, 7),
	foreign: addDays(WEEKS.p, 14)
};
const prevMonday = addDays(mondayOf(todayUtc()), -7);
const staleMonday = addDays(mondayOf(todayUtc()), -21);

const card = (page: Page, title: string) =>
	page.getByTestId('leftover-batch').filter({ hasText: title });
const fridgeRow = (page: Page, title: string) =>
	page.locator('section[aria-labelledby="fridge-title"] li').filter({ hasText: title });

/** The batch id of a title, read from the Leftover tab's radio in an Add dialog (then closed). */
const batchIdOf = async (page: Page, week: string, where: string, title: string) => {
	await openWeek(page, week);
	await openAdd(page, where);
	await dialog(page).getByRole('tab', { name: 'Leftover' }).click();
	const id = await dialog(page)
		.getByRole('radio', { name: new RegExp(title) })
		.getAttribute('value');
	await page.keyboard.press('Escape');
	return id!;
};

test('recipes exist for the leftovers specs', async ({ page, browser }) => {
	await cleanupRecipes(browser);
	await clearWeeks(page, [...Object.values(WK), prevMonday, staleMonday]);
	for (const title of Object.values(R)) await createRecipe(page, title, 6);
});

test('Batch from a cook', async ({ page }) => {
	await openWeek(page, WK.batch);
	await addCook(page, 'Mon dinner', R.batch, 6, 2);
	await open(page, '/leftovers');
	const c = card(page, R.batch);
	await expect(c).toHaveCount(1);
	await expect(c).toContainText('Cooked Mon Apr 21, dinner');
	await expect(c).toContainText('eat by Fri Apr 25');
	await expect(c).toContainText('cooked 6, eaten 2');
	await expect(c).toContainText(/4\s*free of 4 spare/);
	await shot(page, CAP, 'batch-from-a-cook');
});

test('Add a leftover', async ({ page }) => {
	await openWeek(page, WK.batch);
	await addLeftover(page, 'Tue lunch', R.batch, 1);
	const e = entryIn(page, 'Tue lunch', R.batch);
	await expect(e).toContainText('Leftover');
	await expect(e).toContainText(`${R.batch}`);
	await expect(e).toContainText('1 serving');
	await expect(fridgeRow(page, R.batch)).toContainText('3 free');
	await shot(page, CAP, 'add-a-leftover');
});

test('Same day, later slot', async ({ page }) => {
	await openWeek(page, WK.batch);
	await addLeftover(page, 'Mon snack', R.batch, 1);
	await expect(entryIn(page, 'Mon snack', R.batch)).toContainText('1 serving');
	await expect(fridgeRow(page, R.batch)).toContainText('2 free');
	await shot(page, CAP, 'same-day-later-slot');
});

test('Batch with planned leftovers', async ({ page }) => {
	await openWeek(page, WK.batch);
	await addLeftover(page, 'Wed lunch', R.batch, 1);
	await open(page, '/leftovers');
	const chips = card(page, R.batch).getByRole('list', { name: 'Planned leftovers' });
	await expect(chips).toContainText('Tue lunch · 1');
	await expect(chips).toContainText('Wed lunch · 1');
	await expect(chips).toContainText('Mon snack · 1');
	await shot(page, CAP, 'batch-with-planned-leftovers');
});

test('Cook with nothing spare', async ({ page }) => {
	await openWeek(page, WK.spareless);
	await addCook(page, 'Mon dinner', R.spareless, 2, 2);
	await openAdd(page, 'Fri dinner');
	await dialog(page).getByRole('tab', { name: 'Leftover' }).click();
	await expect(dialog(page).getByRole('radio', { name: new RegExp(R.spareless) })).toHaveCount(0);
	await shot(page, CAP, 'cook-with-nothing-spare');
	await page.keyboard.press('Escape');
	// Its batch holds 0 free servings.
	await expect(fridgeRow(page, R.spareless)).toHaveCount(0);
});

test('Draw more than is free', async ({ page }) => {
	await openWeek(page, WK.few);
	await addCook(page, 'Mon dinner', R.few, 3, 2);
	const batchId = await batchIdOf(page, WK.few, 'Tue lunch', R.few);
	// Through the dialog.
	await openAdd(page, 'Tue lunch');
	await dialog(page).getByRole('tab', { name: 'Leftover' }).click();
	await dialog(page)
		.getByRole('radio', { name: new RegExp(R.few) })
		.check();
	await dialog(page).getByLabel('Servings').fill('2');
	await dialog(page).getByRole('button', { name: 'Add leftover' }).click();
	await page.waitForTimeout(1500);
	const appMessage = await dialog(page)
		.getByText(/Only 1 serving is free/)
		.isVisible();
	const native = await dialog(page)
		.getByLabel('Servings')
		.evaluate((el: HTMLInputElement) => el.validationMessage);
	console.log('draw too many: app message visible =', appMessage, '| native validation =', native);
	await shot(page, CAP, 'draw-more-than-is-free');
	await page.keyboard.press('Escape');
	// Through a crafted request (what the server enforces, whatever the browser allows).
	const res = await postAction(page, '/plan?/addLeftover', {
		date: addDays(WK.few, 1),
		slot: 'lunch',
		batchId,
		servings: '2'
	});
	console.log('draw too many (server):', res.body.slice(0, 220));
	expect(res.body).toContain('"type":"failure"');
	expect(res.body).toContain('Only 1 serving is free');
	await page.reload();
	await expect(slot(page, 'Tue lunch').getByTestId('plan-entry')).toHaveCount(0);
	expect(appMessage, 'the dialog itself should say only 1 serving is free').toBe(true);
});

test('Two draws at once', async ({ page }) => {
	await openWeek(page, WK.race);
	await addCook(page, 'Mon dinner', R.race, 2, 1);
	const batchId = await batchIdOf(page, WK.race, 'Tue lunch', R.race);
	const draw = (s: string) =>
		postAction(page, '/plan?/addLeftover', {
			date: addDays(WK.race, 1),
			slot: s,
			batchId,
			servings: '1'
		});
	const results = await Promise.all([draw('lunch'), draw('dinner')]);
	console.log(
		'race',
		results.map((r) => r.body.slice(0, 120))
	);
	const ok = results.filter((r) => r.body.includes('"type":"success"'));
	const failed = results.filter((r) => r.body.includes('"type":"failure"'));
	expect(ok).toHaveLength(1);
	expect(failed).toHaveLength(1);
	await page.reload();
	await expect(
		page.getByTestId('plan-entry').filter({ visible: true }).filter({ hasText: 'Leftover' })
	).toHaveCount(1);
	await open(page, '/leftovers');
	await expect(card(page, R.race)).toContainText(/0\s*free of 1 spare/);
	await shot(page, CAP, 'two-draws-at-once');
});

test('Same day, earlier slot', async ({ page }) => {
	await openWeek(page, WK.early);
	await addCook(page, 'Mon dinner', R.early, 4, 2);
	const batchId = await batchIdOf(page, WK.early, 'Tue lunch', R.early);
	const res = await postAction(page, '/plan?/addLeftover', {
		date: WK.early,
		slot: 'lunch',
		batchId,
		servings: '1'
	});
	console.log('earlier slot:', res.body.slice(0, 200));
	expect(res.body).toContain('"type":"failure"');
	expect(res.body).toContain('Leftovers must come after the cook');
	// The dialog does not offer the batch for Monday lunch either.
	await page.reload();
	await openAdd(page, 'Mon lunch');
	await dialog(page).getByRole('tab', { name: 'Leftover' }).click();
	await expect(dialog(page).getByRole('radio', { name: new RegExp(R.early) })).toHaveCount(0);
	await shot(page, CAP, 'same-day-earlier-slot');
	await page.keyboard.press('Escape');
	await expect(slot(page, 'Mon lunch').getByTestId('plan-entry')).toHaveCount(0);
});

test('Plan past eat-by', async ({ page }) => {
	await openWeek(page, WK.late);
	await addCook(page, 'Mon dinner', R.late, 4, 2);
	await openAdd(page, 'Sat lunch');
	await dialog(page).getByRole('tab', { name: 'Leftover' }).click();
	await expect(
		dialog(page)
			.locator('label')
			.filter({ hasText: R.late })
			.getByText('Past eat-by. You can still add it.')
	).toBeVisible();
	await dialog(page)
		.getByRole('radio', { name: new RegExp(R.late) })
		.check();
	await dialog(page).getByLabel('Servings').fill('1');
	await dialog(page).getByRole('button', { name: 'Add leftover' }).click();
	await expect(dialog(page)).toHaveCount(0);
	const e = entryIn(page, 'Sat lunch', R.late);
	await expect(e).toContainText('Past eat-by (Fri)');
	await shot(page, CAP, 'plan-past-eat-by');
	await open(page, '/leftovers');
	await expect(card(page, R.late).getByRole('list', { name: 'Planned leftovers' })).toContainText(
		/Sat\s+lunch · 1 · past eat-by/
	);
});

test('Fridge panel', async ({ page }) => {
	await openWeek(page, WK.fridge);
	await addCook(page, 'Mon dinner', R.fridge, 2, 1);
	const row = fridgeRow(page, R.fridge);
	await expect(row).toContainText('1 free');
	await expect(row).toContainText('0 planned');
	await expect(
		page.getByRole('region', { name: 'In the fridge' }).getByRole('link', { name: 'Leftovers' })
	).toBeVisible();
	await shot(page, CAP, 'fridge-panel');
});

test('No batches', async ({ other }) => {
	await open(other, '/leftovers');
	await expect(other.getByText('No leftovers yet')).toBeVisible();
	await expect(
		other.getByRole('main').getByRole('link', { name: 'weekly plan' }).first()
	).toHaveAttribute('href', '/plan');
	await shot(other, CAP, 'no-batches');
});

test('Finished batch', async ({ page }) => {
	await openWeek(page, prevMonday);
	await addCook(page, 'Mon dinner', R.finished, 3, 1);
	await addLeftover(page, 'Tue lunch', R.finished, 2);
	await open(page, '/leftovers');
	await expect(card(page, R.finished)).toHaveCount(0);
	const gone = page.getByRole('region', { name: /Finished or thrown out/ });
	await expect(gone).toContainText(R.finished);
	await expect(gone).toContainText('Finished: all 2 servings planned');
	await shot(page, CAP, 'finished-batch');
});

test('Batch past eat-by is marked on the leftovers page', async ({ page }) => {
	await openWeek(page, staleMonday);
	await addCook(page, 'Mon dinner', R.stale, 3, 1);
	await open(page, '/leftovers');
	await expect(card(page, R.stale)).toContainText('Past eat-by');
	await shot(page, CAP, 'batch-past-eat-by-marked');
});

test('Throw out', async ({ page }) => {
	await openWeek(page, WK.toss);
	await addCook(page, 'Mon dinner', R.toss, 3, 1);
	await open(page, '/leftovers');
	await page.getByRole('button', { name: `Throw out ${R.toss}` }).click();
	const confirm = page.getByRole('dialog', { name: `Throw out ${R.toss}?` });
	await expect(confirm).toBeVisible();
	await confirm.getByRole('button', { name: 'Throw out' }).click();
	await expect(card(page, R.toss)).toHaveCount(0);
	const gone = page.getByRole('region', { name: /Finished or thrown out/ });
	await expect(gone).toContainText(R.toss);
	await expect(gone).toContainText('Thrown out');
	await shot(page, CAP, 'throw-out');
	await openWeek(page, WK.toss);
	await openAdd(page, 'Fri lunch');
	await dialog(page).getByRole('tab', { name: 'Leftover' }).click();
	await expect(dialog(page).getByRole('radio', { name: new RegExp(R.toss) })).toHaveCount(0);
	await page.keyboard.press('Escape');
});

test('Planned leftovers of a thrown-out batch', async ({ page }) => {
	await openWeek(page, WK.tossPlanned);
	await addCook(page, 'Mon dinner', R.tossPlanned, 4, 1);
	await addLeftover(page, 'Fri lunch', R.tossPlanned, 1);
	await open(page, '/leftovers');
	await page.getByRole('button', { name: `Throw out ${R.tossPlanned}` }).click();
	const confirm = page.getByRole('dialog', { name: `Throw out ${R.tossPlanned}?` });
	await expect(confirm).toContainText('Leftovers already on the plan stay there');
	await confirm.getByRole('button', { name: 'Throw out' }).click();
	await expect(card(page, R.tossPlanned)).toHaveCount(0);
	await openWeek(page, WK.tossPlanned);
	const e = entryIn(page, 'Fri lunch', R.tossPlanned);
	await expect(e).toBeVisible();
	await expect(e).toContainText('Thrown out');
	await shot(page, CAP, 'planned-leftovers-of-a-thrown-out-batch');
});

test('Cancel throw out', async ({ page }) => {
	await openWeek(page, WK.keep);
	await addCook(page, 'Mon dinner', R.keep, 3, 1);
	await open(page, '/leftovers');
	const before = (await card(page, R.keep).innerText()).replace(/\s+/g, ' ');
	await page.getByRole('button', { name: `Throw out ${R.keep}` }).click();
	const confirm = page.getByRole('dialog', { name: `Throw out ${R.keep}?` });
	await expect(confirm).toBeVisible();
	await confirm.getByRole('button', { name: 'Keep' }).click();
	await expect(confirm).toBeHidden();
	await page.reload();
	await expect(card(page, R.keep)).toHaveCount(1);
	expect((await card(page, R.keep).innerText()).replace(/\s+/g, ' ')).toBe(before);
	await shot(page, CAP, 'cancel-throw-out');
});

test("Draw from another user's batch", async ({ page, other }) => {
	await openWeek(page, WK.foreign);
	await addCook(page, 'Mon dinner', R.foreign, 4, 1);
	const batchId = await batchIdOf(page, WK.foreign, 'Tue lunch', R.foreign);
	await openWeek(other, WK.foreign);
	const draw = (id: string) =>
		postAction(other, '/plan?/addLeftover', {
			date: addDays(WK.foreign, 1),
			slot: 'lunch',
			batchId: id,
			servings: '1'
		});
	const foreignDraw = await draw(batchId);
	const missingDraw = await draw(FAKE_ID);
	console.log('foreign draw:', foreignDraw.body.slice(0, 200));
	expect(foreignDraw).toEqual(missingDraw);
	expect(foreignDraw.body).toContain('"type":"failure"');
	await openWeek(page, WK.foreign);
	await expect(slot(page, 'Tue lunch').getByTestId('plan-entry')).toHaveCount(0);
	await shot(page, CAP, 'draw-from-another-users-batch');
});

test("Throw out another user's batch", async ({ page, other }) => {
	const batchId = await batchIdOf(page, WK.foreign, 'Tue lunch', R.foreign);
	await open(other, '/leftovers');
	const toss = (id: string) => postAction(other, '/leftovers?/throwOut', { batchId: id });
	const foreignToss = await toss(batchId);
	const missingToss = await toss(FAKE_ID);
	console.log('foreign throw out:', foreignToss.body.slice(0, 200));
	expect(foreignToss).toEqual(missingToss);
	expect(foreignToss.body).toContain('"type":"failure"');
	// Nothing changed for the owner.
	await open(page, '/leftovers');
	await expect(card(page, R.foreign)).toContainText(/3\s*free of 3 spare/);
	await openWeek(page, WK.foreign);
	await expect(slot(page, 'Tue lunch').getByTestId('plan-entry')).toHaveCount(0);
	await shot(page, CAP, 'throw-out-another-users-batch');
	await expect(card(other as Page, R.foreign)).toHaveCount(0);
});

test('cleanup qa data', async ({ browser }) => {
	await cleanupRecipes(browser);
});
