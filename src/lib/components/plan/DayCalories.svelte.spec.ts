import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import DayList from './DayList.svelte';
import DayCalories from './DayCalories.svelte';

describe('DayCalories', () => {
	it('shows a rounded day total', async () => {
		const screen = render(DayCalories, { total: { kcal: 395.4, partial: false } });
		await expect.element(screen.getByText('395 kcal')).toBeVisible();
		expect(screen.container.querySelector('[data-partial]')).toBeNull();
	});

	it('marks a partial day', async () => {
		const screen = render(DayCalories, { total: { kcal: 1200, partial: true } });
		await expect.element(screen.getByText('1,200 kcal')).toBeVisible();
		await expect.element(screen.getByText('· partial')).toBeVisible();
		expect(screen.container.textContent?.trim()).toBe('1,200 kcal · partial');
	});

	it('shows nothing for a day with nothing planned', () => {
		const screen = render(DayCalories, { total: undefined });
		expect(screen.container.textContent?.trim()).toBe('');
	});

	it('shows totals only on days that have them in the phone list', () => {
		const screen = render(DayList, {
			days: ['2026-11-09', '2026-11-10'],
			today: '2026-11-09',
			entriesIn: () => [],
			onadd: () => {},
			onedit: () => {},
			onneedsconfirm: () => {},
			dayKcal: { '2026-11-09': { kcal: 395, partial: false } }
		});
		const totals = [...screen.container.querySelectorAll('[data-day-kcal]')];
		expect(totals.map((t) => t.getAttribute('data-day-kcal'))).toEqual(['395']);
	});
});
