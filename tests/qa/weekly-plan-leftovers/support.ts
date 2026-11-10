// Shared helpers for the weekly-plan-leftovers QA specs.
import {
	expect,
	test as base,
	type Browser,
	type BrowserContext,
	type Locator,
	type Page
} from '@playwright/test';
import { credentials, deleteQaRecipes, open, QA_PREFIX, signIn } from '../helpers';

export const creds = credentials();
// Fixed (not per-run) so a restarted worker still finds the data earlier tests made.
export const RUN = 'wpl';
/** Custom foods cannot be deleted, so each run (QA_RUN=<anything>) gets fresh names to avoid duplicates. */
export const FRUN = process.env.QA_RUN ?? 'wpl';
export const SHOTS = 'openspec/changes/weekly-plan-leftovers/qa/screenshots';
const DEV_URL = 'https://meal-planner-dev--lehman-meals.us-east5.hosted.app';
export const BASE = process.env.QA_BASE_URL ?? DEV_URL;

/** Screenshot with the signed-in email masked. */
export const shot = async (page: Page, capability: string, slug: string) => {
	await page.evaluate(() => {
		const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
		for (let n = walker.nextNode(); n; n = walker.nextNode())
			if (n.nodeValue && /\S+@\S+/.test(n.nodeValue))
				n.nodeValue = n.nodeValue.replace(/\S+@\S+/g, 'qa-user@example.test');
	});
	await page.screenshot({ path: `${SHOTS}/${capability}-${slug}.png`, fullPage: false });
};

/** Weeks far in the future so QA never collides with real plans. */
export const WEEKS = {
	a: '2031-03-03',
	b: '2031-03-10',
	c: '2031-03-17',
	d: '2031-03-24',
	e: '2031-03-31',
	f: '2031-04-07',
	g: '2031-04-14',
	h: '2031-04-21',
	i: '2031-04-28',
	j: '2031-05-05',
	k: '2031-05-12',
	l: '2031-05-19',
	m: '2031-05-26',
	n: '2031-06-02',
	o: '2031-06-09',
	p: '2031-06-16'
};

export const addDays = (iso: string, n: number) => {
	const d = new Date(`${iso}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + n);
	return d.toISOString().slice(0, 10);
};
export const mondayOf = (iso: string) => {
	const d = new Date(`${iso}T00:00:00Z`);
	return addDays(iso, -((d.getUTCDay() + 6) % 7));
};
export const todayUtc = () => new Date().toISOString().slice(0, 10);

type State = Awaited<ReturnType<BrowserContext['storageState']>>;
const states = new Map<string, State>();

/** Signs in once per account per worker and reuses the session. */
export const stateFor = async (browser: Browser, which: 'user' | 'other'): Promise<State> => {
	const cached = states.get(which);
	if (cached) return cached;
	const context = await browser.newContext();
	const page = await context.newPage();
	await signIn(page, creds[which]);
	const state = await context.storageState();
	await context.close();
	states.set(which, state);
	return state;
};

export const test = base.extend<{ other: Page }>({
	page: async ({ browser }, use) => {
		const context = await browser.newContext({
			storageState: await stateFor(browser, 'user'),
			viewport: { width: 1440, height: 1000 }
		});
		const page = await context.newPage();
		await use(page);
		await context.close();
	},
	other: async ({ browser }, use) => {
		const context = await browser.newContext({
			storageState: await stateFor(browser, 'other'),
			viewport: { width: 1440, height: 1000 }
		});
		const page = await context.newPage();
		await use(page);
		await context.close();
	}
});
export { expect };

export const openWeek = (page: Page, monday: string) => open(page, `/plan?week=${monday}`);

/** The visible slot cell, e.g. slot(page, 'Mon dinner'). */
export const slot = (page: Page, name: string): Locator =>
	page.getByRole('group', { name, exact: true }).filter({ visible: true });

export const entryIn = (page: Page, where: string, text: string | RegExp): Locator =>
	slot(page, where).getByTestId('plan-entry').filter({ hasText: text });

export const dialog = (page: Page) => page.getByRole('dialog');

export const openAdd = async (page: Page, where: string) => {
	await slot(page, where)
		.getByRole('button', { name: `Add to ${where}` })
		.click();
	await expect(dialog(page).getByRole('heading', { name: `Add to ${where}` })).toBeVisible();
};

const closed = async (page: Page) => {
	await expect(dialog(page)).toHaveCount(0);
	await page.waitForLoadState('networkidle');
};

export const createRecipe = async (page: Page, title: string, servings: number) => {
	await open(page, '/recipes/new');
	await page.getByLabel('Title').fill(title);
	await page.getByLabel('Servings').fill(String(servings));
	await page.getByLabel('Paste ingredient lines').fill('1 cup rice');
	await page.getByRole('button', { name: 'Save recipe' }).click();
	await expect(page.getByRole('heading', { name: title })).toBeVisible();
	return new URL(page.url()).pathname;
};

export const addCook = async (
	page: Page,
	where: string,
	title: string,
	cooked: number,
	eaten: number
) => {
	await openAdd(page, where);
	await dialog(page).getByLabel('Search recipes').fill(title);
	await dialog(page)
		.getByRole('radio', { name: new RegExp(title) })
		.check();
	await dialog(page).getByLabel('Servings to cook').fill(String(cooked));
	await dialog(page).getByLabel('Eaten at this meal').fill(String(eaten));
	await dialog(page).getByRole('button', { name: 'Add cook' }).click();
	await closed(page);
};

export const addLeftover = async (page: Page, where: string, title: string, servings: number) => {
	await openAdd(page, where);
	await dialog(page).getByRole('tab', { name: 'Leftover' }).click();
	await dialog(page)
		.getByRole('radio', { name: new RegExp(title) })
		.check();
	await dialog(page).getByLabel('Servings').fill(String(servings));
	await dialog(page).getByRole('button', { name: 'Add leftover' }).click();
	await closed(page);
};

export const searchFood = async (page: Page, q: string) => {
	await dialog(page).getByRole('tab', { name: 'Food' }).click();
	await dialog(page).getByLabel('Search foods').fill(q);
};

/** Creates a custom food and adds it in one step. */
export const createFood = async (
	page: Page,
	where: string,
	name: string,
	n: { kcal: string; protein: string; carbs: string; fat: string },
	amount: string
) => {
	await openAdd(page, where);
	await searchFood(page, name);
	await dialog(page)
		.getByRole('button', { name: `Create “${name}”` })
		.click();
	const d = dialog(page);
	await d.getByLabel('kcal', { exact: true }).fill(n.kcal);
	await d.getByLabel('Protein g').fill(n.protein);
	await d.getByLabel('Carbs g').fill(n.carbs);
	await d.getByLabel('Fat g').fill(n.fat);
	await d.getByLabel('Amount').fill(amount);
	await d.getByRole('button', { name: 'Create food and add' }).click();
	await closed(page);
};

export const addExistingFood = async (
	page: Page,
	where: string,
	name: string,
	amount: string,
	unit = 'g'
) => {
	await openAdd(page, where);
	await searchFood(page, name);
	await dialog(page)
		.getByRole('radio', { name: new RegExp(name) })
		.check();
	await dialog(page).getByLabel('Amount').fill(amount);
	await dialog(page).getByLabel('Unit').selectOption(unit);
	await dialog(page).getByRole('button', { name: 'Add food' }).click();
	await closed(page);
};

/** Removes every qa- recipe (and with it their plan entries and batches). */
export const cleanupRecipes = async (browser: Browser) => {
	const context = await browser.newContext({ storageState: await stateFor(browser, 'user') });
	const page = await context.newPage();
	await deleteQaRecipes(page);
	await context.close();
};

/** Posts a form action as the signed-in session and returns status plus body. */
export const postAction = async (
	page: Page,
	path: string,
	fields: Record<string, string>
): Promise<{ status: number; body: string }> => {
	const res = await page.request.post(`${BASE}${path}`, {
		form: fields,
		headers: { origin: BASE, 'x-sveltekit-action': 'true' }
	});
	return { status: res.status(), body: await res.text() };
};

/** Food search through the app's own endpoint, as the signed-in session. */
export const searchFoodsApi = async (page: Page, q: string) => {
	const res = await page.request.get(`${BASE}/plan/foods?q=${encodeURIComponent(q)}`);
	return (await res.json()) as {
		foods: { id: string; name: string; own: boolean; units: string[] }[];
	};
};

export const FAKE_ID = '00000000-0000-4000-8000-000000000000';
export { QA_PREFIX, open };

/** Removes every entry in the given weeks (QA-only far-future weeks), so reruns start clean. */
export const clearWeeks = async (page: Page, weeks: string[]) => {
	for (const week of weeks) {
		await openWeek(page, week);
		for (let guard = 0; guard < 40; guard++) {
			const remove = page
				.getByRole('button', { name: /^Remove / })
				.filter({ visible: true })
				.first();
			if (!(await remove.isVisible().catch(() => false))) break;
			await remove.click();
			const confirm = page.getByRole('button', { name: 'Remove cook and leftovers' });
			await page.waitForTimeout(600);
			if (await confirm.isVisible().catch(() => false)) await confirm.click();
			await page.waitForLoadState('networkidle');
		}
	}
};
