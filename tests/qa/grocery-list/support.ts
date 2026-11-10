// Shared helpers for the grocery-list QA specs.
import type { Browser, Locator, Page } from '@playwright/test';
import {
	open,
	expect,
	QA_PREFIX,
	BASE,
	stateFor,
	postAction
} from '../weekly-plan-leftovers/support';

export * from '../weekly-plan-leftovers/support';

export const SHOTS = 'openspec/changes/grocery-list/qa/screenshots';

/** Screenshot with the signed-in email masked. */
export const gshot = async (page: Page, capability: string, slug: string) => {
	await page.evaluate(() => {
		const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
		for (let n = walker.nextNode(); n; n = walker.nextNode())
			if (n.nodeValue && /\S+@\S+/.test(n.nodeValue))
				n.nodeValue = n.nodeValue.replace(/\S+@\S+/g, 'qa-user@example.test');
	});
	await page.screenshot({ path: `${SHOTS}/${capability}-${slug}.png`, fullPage: false });
};

/** Weeks for the grocery QA, far in the future (Mondays). */
export const GW = {
	main: '2031-07-07', // chili + leftovers
	raised: '2031-07-14',
	lowered: '2031-07-21',
	cookWeek: '2031-07-28', // cook on Sunday
	leftoverWeek: '2031-08-04', // only a leftover from the week before
	empty: '2031-08-11',
	foods: '2031-08-18',
	merge: '2031-08-25',
	aisleA: '2031-09-01',
	aisleB: '2031-09-08',
	extras: '2031-09-15',
	limit: '2031-09-22',
	sameUnit: '2031-09-29',
	extraTick: '2031-10-06'
};
export const ALL_WEEKS = Object.values(GW);

export const openGrocery = (page: Page, monday: string) => open(page, `/grocery?week=${monday}`);

/** The grocery row whose name matches exactly (case-insensitive). */
export const row = (page: Page, name: string): Locator =>
	page.getByTestId('grocery-item').filter({ has: page.getByText(new RegExp(`^${name}$`, 'i')) });

export const aisle = (page: Page, name: string): Locator =>
	page.getByRole('region', { name, exact: true });

export const progress = (page: Page) => page.getByTestId('grocery-progress');

export const createRecipeWith = async (
	page: Page,
	title: string,
	servings: number,
	lines: string[]
) => {
	await open(page, '/recipes/new');
	await page.getByLabel('Title').fill(title);
	await page.getByLabel('Servings').fill(String(servings));
	await page.getByLabel('Paste ingredient lines').fill(lines.join('\n'));
	await page.getByRole('button', { name: 'Save recipe' }).click();
	await expect(page.getByRole('heading', { name: title })).toBeVisible();
};

/** Extra-item ids on the current grocery page, read from the (hidden) remove forms. */
export const extraIds = (page: Page) =>
	page
		.locator('form[action*="remove"] input[name="id"]')
		.evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));

export const removeExtrasInWeek = async (page: Page, monday: string) => {
	await openGrocery(page, monday);
	for (const id of await extraIds(page))
		await postAction(page, `/grocery?/remove`, { week: monday, id });
};

export const cleanupGrocery = async (browser: Browser) => {
	const context = await browser.newContext({ storageState: await stateFor(browser, 'user') });
	const page = await context.newPage();
	for (const w of ALL_WEEKS) await removeExtrasInWeek(page, w);
	await context.close();
};
export { QA_PREFIX, BASE };
