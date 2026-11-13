// Shared helpers for the nutrition QA specs. Re-uses the weekly-plan-leftovers plan helpers.
import type { Locator, Page } from '@playwright/test';
import {
	BASE,
	FAKE_ID,
	addDays,
	addExistingFood,
	addCook,
	addLeftover,
	clearWeeks,
	cleanupRecipes,
	createFood,
	dialog,
	entryIn,
	expect,
	mondayOf,
	open,
	openAdd,
	openWeek,
	postAction,
	searchFood,
	searchFoodsApi,
	slot,
	test,
	todayUtc
} from '../weekly-plan-leftovers/support';

export {
	BASE,
	FAKE_ID,
	addDays,
	addExistingFood,
	addCook,
	addLeftover,
	clearWeeks,
	cleanupRecipes,
	createFood,
	dialog,
	entryIn,
	expect,
	mondayOf,
	open,
	openAdd,
	openWeek,
	postAction,
	searchFood,
	searchFoodsApi,
	slot,
	test,
	todayUtc
};

export const SHOTS = 'openspec/changes/nutrition/qa/screenshots';

/** Screenshot with the signed-in email masked. */
export const shot = async (page: Page, capability: string, slug: string, target?: Locator) => {
	await page.evaluate(() => {
		const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
		for (let n = walker.nextNode(); n; n = walker.nextNode())
			if (n.nodeValue && /\S+@\S+/.test(n.nodeValue))
				n.nodeValue = n.nodeValue.replace(/\S+@\S+/g, 'qa-user@example.test');
	});
	const path = `${SHOTS}/${capability}-${slug}.png`;
	if (target) await target.screenshot({ path });
	else await page.screenshot({ path });
};

/** Weeks far in the future, one per scenario group. */
export const W = {
	chart: '2031-03-03',
	avg: '2031-03-10',
	empty: '2031-03-17',
	log: '2031-03-24',
	plan: '2031-03-31',
	priv: '2031-04-07',
	goals: '2031-04-14',
	foods: '2031-04-21',
	edit: '2031-04-28',
	partial: '2031-05-05'
};
export const ALL_WEEKS = Object.values(W);
