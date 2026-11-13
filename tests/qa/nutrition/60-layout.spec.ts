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
	mondayOf,
	todayUtc
} from './support';
import { clearLogs, logFood, planDayKcal } from './fixtures';

const CAP = 'nutrition';
test.describe.configure({ mode: 'serial' });
test.use({ actionTimeout: 15_000 });

const dataWeek = W.partial; // far-future week, Monday 2031-05-05
const thisWeek = mondayOf(todayUtc());

/** Visible text rectangles that intersect the chart heading (excluding the heading's own text). */
const overlapsHeading = (page: Page) =>
	page.evaluate(() => {
		const h = document.getElementById('chart-title')!;
		const hr = h.getBoundingClientRect();
		const hits: string[] = [];
		const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
		for (let n = walker.nextNode(); n; n = walker.nextNode()) {
			const text = (n.nodeValue ?? '').trim();
			if (!text || h.contains(n)) continue;
			const el = n.parentElement!;
			if (['SCRIPT', 'STYLE'].includes(el.tagName)) continue;
			// Skip text inside a visually hidden (1px, overflow hidden) wrapper such as sr-only.
			let clipped = false;
			for (let a: HTMLElement | null = el; a && a !== document.body; a = a.parentElement) {
				const b = a.getBoundingClientRect();
				if (b.width <= 2 && b.height <= 2 && getComputedStyle(a).overflow !== 'visible') clipped = true;
			}
			if (clipped) continue;
			const range = document.createRange();
			range.selectNodeContents(n);
			for (const r of Array.from(range.getClientRects())) {
				if (r.width <= 2 || r.height <= 2) continue; // sr-only / clipped
				const ox = Math.min(r.right, hr.right) - Math.max(r.left, hr.left);
				const oy = Math.min(r.bottom, hr.bottom) - Math.max(r.top, hr.top);
				if (ox > 1 && oy > 1) hits.push(text.slice(0, 60));
			}
		}
		return { hits, heading: h.innerText };
	});

test.beforeAll(async ({ browser }) => {
	test.setTimeout(180_000);
	const { stateFor } = await import('../weekly-plan-leftovers/support');
	const context = await browser.newContext({ storageState: await stateFor(browser, 'user') });
	const page = await context.newPage();
	await clearLogs(page, [dataWeek, thisWeek]);
	await clearWeeks(page, [dataWeek, thisWeek]);
	await openWeek(page, dataWeek);
	await addCook(page, 'Mon dinner', 'qa-nut-full', 1, 1);
	await addCook(page, 'Tue dinner', 'qa-nut-partial', 3, 1);
	await open(page, `/nutrition?week=${dataWeek}`);
	await logFood(page, addDays(dataWeek, 3), 'qa-nut-snack', 'qa-nut-snack', '100');
	// This week, with today partial, so the Today card shows its partial label.
	await openWeek(page, thisWeek);
	await context.close();
});

test.afterAll(async ({ browser }) => {
	const { stateFor } = await import('../weekly-plan-leftovers/support');
	const context = await browser.newContext({ storageState: await stateFor(browser, 'user') });
	const page = await context.newPage();
	await clearLogs(page, [dataWeek, thisWeek]);
	await clearWeeks(page, [dataWeek, thisWeek]);
	await context.close();
});

for (const [name, width, height] of [
	['desktop', 1440, 900],
	['phone', 390, 844]
] as const) {
	test(`Layout ${name}: nothing overlaps the chart heading and no horizontal scroll`, async ({
		page
	}) => {
		await page.setViewportSize({ width, height });
		await open(page, `/nutrition?week=${dataWeek}`);
		await expect(page.locator('#chart-title')).toHaveText('Calories by day');
		const { hits, heading } = await overlapsHeading(page);
		expect(heading).toBe('Calories by day');
		expect(hits, `text overlapping the heading: ${hits.join(' | ')}`).toEqual([]);
		// The screen-reader table (and its caption) must sit in a 1px clipped wrapper, not in the flow.
		const hidden = await page.locator('caption').evaluate((c) => {
			for (let a: HTMLElement | null = c; a && a !== document.body; a = a.parentElement) {
				const b = a.getBoundingClientRect();
				if (b.width <= 2 && b.height <= 2 && getComputedStyle(a).overflow !== 'visible') return true;
			}
			return false;
		});
		expect(hidden, 'table caption is visually hidden').toBe(true);
		const widths = await page.evaluate(() => ({
			scroll: document.documentElement.scrollWidth,
			view: window.innerWidth
		}));
		expect(widths.scroll, `scrollWidth ${widths.scroll} vs viewport ${widths.view}`).toBeLessThanOrEqual(
			widths.view
		);
		await page.locator('#chart-title').scrollIntoViewIfNeeded();
		await shot(page, CAP, `layout-${name}-chart`, page.locator('section[aria-labelledby="chart-title"]'));
		await shot(page, CAP, `layout-${name}-full`);
	});
}

test('Phone: Today card and plan day totals read cleanly', async ({ page }) => {
	test.setTimeout(120_000);
	// Plan a partial cook on today (browser-local date) so Today shows its partial label.
	await open(page, '/nutrition');
	const today = await page.locator('#log-date').inputValue();
	const week = mondayOf(today);
	await openWeek(page, week);
	const dayIdx = Math.round(
		(Date.parse(`${today}T00:00:00Z`) - Date.parse(`${week}T00:00:00Z`)) / 86_400_000
	);
	const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
	await addCook(page, `${dayNames[dayIdx]} dinner`, 'qa-nut-partial', 3, 1);
	await page.setViewportSize({ width: 390, height: 844 });
	await open(page, '/nutrition');
	const card = page.getByTestId('today-card');
	await expect(card).toBeVisible();
	const label = await card.locator('div').first().innerText();
	expect(label).toMatch(/so far\s·\spartial/);
	expect(label).not.toMatch(/\n/); // the label stays on one line
	const nbsp = await card.locator('div').first().evaluate((e) => e.textContent!.includes('\u00a0'));
	expect(nbsp).toBe(true);
	const widths = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
	expect(widths[0]).toBeLessThanOrEqual(widths[1]);
	await shot(page, CAP, 'layout-today-card-partial', card);

	// Plan day totals.
	await openWeek(page, dataWeek);
	const mon = await planDayKcal(page, dataWeek);
	const tue = await planDayKcal(page, addDays(dataWeek, 1));
	expect(mon?.kcal).toBe(230);
	expect(mon?.partial).toBe(false);
	expect(tue?.kcal).toBe(330);
	expect(tue?.partial).toBe(true);
	const monText = (await mon!.header.innerText()).replace(/\s+/g, ' ');
	const tueText = (await tue!.header.innerText()).replace(/\s+/g, ' ');
	expect(monText).toMatch(/230 kcal/);
	expect(monText).not.toMatch(/partial/);
	expect(tueText).toMatch(/330 kcal/);
	expect(tueText).toMatch(/partial/);
	const tueHtml = await tue!.header.locator('[data-day-kcal]').evaluate((e) => e.textContent!);
	test.info().annotations.push({ type: 'tue-day-total-text', description: JSON.stringify(tueHtml) });
	// What the phone actually shows: the visible day list entries.
	const visible = page.locator('[data-day-kcal]:visible');
	const texts = (await visible.allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
	test.info().annotations.push({ type: 'phone-visible-day-totals', description: texts.join(' | ') });
	expect(texts.some((t) => /^330 kcal · partial$/.test(t.replace(/ /g, ' ')))).toBe(true);
	expect(texts.some((t) => /^230 kcal$/.test(t))).toBe(true);
	await visible.nth(1).scrollIntoViewIfNeeded();
	await shot(page, CAP, 'layout-plan-day-totals');
	const w2 = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
	test.info().annotations.push({ type: 'plan-phone-scroll', description: String(w2) });
});
