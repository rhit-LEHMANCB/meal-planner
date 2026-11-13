import { test, expect, ALL_WEEKS, clearWeeks, cleanupRecipes, mondayOf, todayUtc } from './support';
import { clearLogs, createRecipe, ensureFood, FOODS, own, perServing } from './fixtures';

test.describe.configure({ mode: 'serial' });

test('Setup: custom foods and shared recipes', async ({ page, browser }) => {
	test.setTimeout(240_000);
	await clearLogs(page, [...ALL_WEEKS, mondayOf(todayUtc())]);
	await clearWeeks(page, ALL_WEEKS);
	await cleanupRecipes(browser);
	for (const name of Object.keys(FOODS)) await ensureFood(page, name);
	await clearWeeks(page, ALL_WEEKS);

	await createRecipe(page, 'qa-nut-full', 2, [
		{ amount: '200', unit: 'g', name: 'qa-nut-chicken', link: own('qa-nut-chicken') },
		{ amount: '100', unit: 'g', name: 'qa-nut-rice', link: own('qa-nut-rice') }
	]);
	expect(await perServing(page)).toBe(230);

	const six = Array.from({ length: 6 }, () => ({
		amount: '100',
		unit: 'g',
		name: 'qa-nut-chicken',
		link: own('qa-nut-chicken')
	}));
	await createRecipe(page, 'qa-nut-partial', 3, [
		...six,
		{ amount: '1', unit: 'pinch', name: 'zzqx saffron' },
		{ amount: '2', unit: '', name: 'zzqx mystery' },
		{ amount: '3', unit: 'g', name: 'zzqx unknown' }
	]);
	expect(await perServing(page)).toBe(330);
});
