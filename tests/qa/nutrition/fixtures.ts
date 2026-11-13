// Fixtures and page helpers for the nutrition QA specs.
import type { Page } from '@playwright/test';
import {
	W,
	createFood,
	dialog,
	expect,
	open,
	openAdd,
	openWeek,
	searchFood,
	searchFoodsApi
} from './support';

export type Per100 = { kcal: string; protein: string; carbs: string; fat: string };
/** Custom foods with round numbers, so expected totals are exact. They cannot be deleted in the UI. */
export const FOODS: Record<string, Per100> = {
	'qa-nut-chicken': { kcal: '165', protein: '31', carbs: '0', fat: '4' },
	'qa-nut-rice': { kcal: '130', protein: '3', carbs: '28', fat: '0' },
	'qa-nut-snack': { kcal: '97', protein: '5', carbs: '10', fat: '3' },
	'qa-nut-dense': { kcal: '800', protein: '20', carbs: '100', fat: '30' }
};

/** Creates the custom food (once per database) by making a plan entry, which clearWeeks removes. */
export const ensureFood = async (page: Page, name: string) => {
	const found = (await searchFoodsApi(page, name)).foods.find((f) => f.own && f.name === name);
	if (found) return found.id;
	await openWeek(page, W.foods);
	await createFood(page, 'Mon breakfast', name, FOODS[name] ?? FOODS['qa-nut-snack'], '10');
	const made = (await searchFoodsApi(page, name)).foods.find((f) => f.own && f.name === name);
	if (!made) throw new Error(`Could not create custom food ${name}`);
	return made.id;
};

export type RowSpec = {
	amount: string;
	unit?: string;
	name: string;
	/** Link the row: search for `query` and pick the first result whose name contains `food`. */
	link?: { query: string; food: string };
	grams?: string;
};

export const linkRow = async (page: Page, n: number, query: string, food: string) => {
	await page.getByRole('button', { name: `Match food, row ${n}` }).click();
	const input = page.getByLabel(`Find a food for row ${n}`);
	await input.fill(query);
	await input.press('Enter');
	await page
		.getByRole('list', { name: `Foods for row ${n}` })
		.getByRole('button')
		.filter({ hasText: food })
		.first()
		.click();
	await expect(page.locator(`[data-row="${n}"] [data-food="linked"]`)).toBeVisible();
};

export const fillRow = async (page: Page, n: number, row: RowSpec) => {
	const li = page.locator(`[data-row="${n}"]`);
	await li.getByLabel(`Amount, row ${n}`).fill(row.amount);
	await li.getByLabel(`Unit, row ${n}`).fill(row.unit ?? '');
	await li.getByLabel(`Name, row ${n}`).fill(row.name);
	await li.getByLabel(`Name, row ${n}`).blur();
	if (row.link) await linkRow(page, n, row.link.query, row.link.food);
	if (row.grams !== undefined) await li.getByLabel('About how many grams?').fill(row.grams);
};

export const startRecipe = async (page: Page, title: string, servings: number, rows: RowSpec[]) => {
	await open(page, '/recipes/new');
	await page.getByLabel('Title').fill(title);
	await page.getByLabel('Servings').fill(String(servings));
	// The form starts with 3 empty rows plus none spare; add until there are enough.
	for (let i = 3; i < rows.length; i++)
		await page.getByRole('button', { name: 'Add ingredient' }).click();
	for (let i = 0; i < rows.length; i++) await fillRow(page, i + 1, rows[i]);
};

export const saveRecipe = async (page: Page, title: string) => {
	await page.getByRole('button', { name: /^Save (recipe|changes)/ }).click();
	await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
	return new URL(page.url()).pathname;
};

export const createRecipe = async (page: Page, title: string, servings: number, rows: RowSpec[]) => {
	await startRecipe(page, title, servings, rows);
	return saveRecipe(page, title);
};

export const own = (name: string): RowSpec['link'] => ({ query: name, food: name });

/** Kcal per serving shown on a recipe page, or null when it says there is no nutrition yet. */
export const perServing = async (page: Page): Promise<number | null> => {
	const dl = page.locator('[data-nutrition="per-serving"]');
	if (!(await dl.isVisible().catch(() => false))) return null;
	const m = (await dl.innerText()).match(/([\d,.]+)\s*kcal/);
	return m ? Number(m[1].replace(/,/g, '')) : null;
};

const SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const dayShort = (iso: string) => SHORT[new Date(`${iso}T00:00:00Z`).getUTCDay()];

/** The calorie line in a plan day header, or null when the day shows none. */
export const planDayKcal = async (page: Page, iso: string) => {
	const header = page
		.getByLabel('Week grid')
		.locator('div.text-center')
		.filter({ hasText: new RegExp(`^${dayShort(iso)}\\s*${Number(iso.slice(8))}`) })
		.first();
	const el = header.locator('[data-day-kcal]');
	if ((await el.count()) === 0) return null;
	return {
		kcal: Number(await el.getAttribute('data-day-kcal')),
		partial: (await el.getAttribute('data-partial')) === 'true',
		header
	};
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Adds a food to a plan slot by searching and picking the first result containing `name`. */
export const planFood = async (
	page: Page,
	where: string,
	name: string,
	amount: string,
	unit = 'g'
) => {
	await openAdd(page, where);
	await searchFood(page, name);
	await dialog(page)
		.getByRole('radio', { name: new RegExp(escapeRe(name)) })
		.first()
		.check();
	await dialog(page).getByLabel('Amount').fill(amount);
	await dialog(page).getByLabel('Unit').selectOption(unit);
	await dialog(page).getByRole('button', { name: 'Add food' }).click();
	await expect(dialog(page)).toHaveCount(0);
	await page.waitForLoadState('networkidle');
};

/** Nutrition page row for a day (screen-reader table). */
export const nDay = (page: Page, iso: string) => page.locator(`tr[data-day="${iso}"]`);
export const nTotal = async (page: Page, iso: string) =>
	Number(await nDay(page, iso).getAttribute('data-total'));
export const nCells = async (page: Page, iso: string) =>
	(await nDay(page, iso).locator('td').allInnerTexts()).map((t) =>
		Number(t.replace(/[^\d.]/g, ''))
	);

export const logFood = async (
	page: Page,
	date: string,
	query: string,
	food: string,
	amount: string,
	unit = 'g'
) => {
	await page.getByRole('radio', { name: 'Food' }).check();
	const search = page.locator('#log-food-search');
	await search.fill(query);
	await search.press('Enter');
	await page
		.getByRole('list', { name: 'Foods found' })
		.getByRole('button')
		.filter({ hasText: food })
		.first()
		.click();
	await page.locator('#log-amount').fill(amount);
	await page.locator('#log-unit').selectOption(unit);
	await page.locator('#log-date').selectOption(date);
	await page.getByRole('button', { name: 'Log it' }).click();
	await expect(page.getByRole('status').filter({ hasText: 'Logged.' })).toBeVisible();
};

export const logRecipe = async (page: Page, date: string, title: string, servings: string) => {
	await page.getByRole('radio', { name: 'Recipe' }).check();
	await page.locator('#log-recipe').selectOption({ label: title });
	await page.locator('#log-servings').fill(servings);
	await page.locator('#log-date').selectOption(date);
	await page.getByRole('button', { name: 'Log it' }).click();
	await expect(page.getByRole('status').filter({ hasText: 'Logged.' })).toBeVisible();
};

/** Deletes the QA log entries of the given weeks (qa- foods/recipes and the QA apple/broccoli logs). */
export const clearLogs = async (page: Page, weeks: string[]) => {
	for (const week of weeks) {
		await open(page, `/nutrition?week=${week}`);
		for (let guard = 0; guard < 30; guard++) {
			const del = page
				.getByRole('button', { name: /^Delete (qa-|Apples, raw|Broccoli, raw)/ })
				.first();
			if (!(await del.isVisible().catch(() => false))) break;
			await del.click();
			await page.waitForLoadState('networkidle');
			await page.waitForTimeout(400);
		}
	}
};

/** Waits (the plan updates after the dialog closes) until the day header shows `kcal`. */
export const expectDayKcal = async (page: Page, iso: string, kcal: number | null) => {
	await expect
		.poll(async () => (await planDayKcal(page, iso))?.kcal ?? null, { timeout: 15_000 })
		.toBe(kcal);
};
