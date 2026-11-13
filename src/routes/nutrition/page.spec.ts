// Renders the Nutrition page on the server with sample data to check its states.
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { DEFAULT_GOALS, type EntryNutrition } from '$lib/domain/nutrition';
import { buildNutritionView } from '$lib/domain/nutrition-view';
import { weekDays } from '$lib/domain/plan';
import Page from './+page.svelte';

const MON = '2026-11-09';
const TUE = '2026-11-10';
const m = (kcal: number) => ({ kcal, proteinG: 118, carbsG: 171, fatG: 52 });

const page = (
	planned: { date: string; nutrition: EntryNutrition }[],
	logs: {
		id: string;
		date: string;
		slot: string | null;
		label: string;
		macros: ReturnType<typeof m>;
	}[] = [],
	today = TUE
) => {
	const days = weekDays(MON);
	const data = {
		monday: MON,
		days,
		today,
		explicitWeek: true,
		goals: DEFAULT_GOALS,
		view: buildNutritionView({ days, today, planned, logs, goals: DEFAULT_GOALS }),
		recipes: [{ id: 'r1', title: 'Chili' }]
	};
	return render(Page as never, { props: { data, form: null } as never }).body;
};

const planned = (date: string, kcal: number, partial = false) => ({
	date,
	nutrition: { macros: m(kcal), partial, part: 'planned' as const }
});

describe('nutrition page', () => {
	it('shows today against the goal with what is left', () => {
		const out = page(
			[planned(TUE, 1000)],
			[{ id: 'l1', date: TUE, slot: 'snack', label: 'Apple · 1 each', macros: m(540) }]
		);
		expect(out).toContain('Tue so far');
		expect(out).toContain('1,540');
		expect(out).toContain('of 2,000 kcal');
		expect(out).toContain('460 kcal left today');
		expect(out).toContain('236 g of 140 g');
		expect(out).toContain('Apple · 1 each');
		expect(out).toContain('Delete Apple · 1 each');
		expect(out).toContain(`data-day="${TUE}" data-total="1540"`);
	});

	it('says how far over the goal today is', () => {
		const out = page([planned(TUE, 2300)]);
		expect(out).toContain('300 kcal over today');
	});

	it('invites planning or logging in an empty week and has no today card for another week', () => {
		const out = page([], [], '2026-12-01');
		expect(out).toContain('Nothing planned or logged this week');
		expect(out).toContain('No days with food yet');
		expect(out).not.toContain('data-testid="today-card"');
	});

	it('marks a partial day', () => {
		const out = page([planned(MON, 800, true)]);
		expect(out).toContain('800 kcal (partial)');
		expect(out).toContain('Partial: some ingredients or entries that day have no nutrition');
	});

	it('posts forms with the week and credits USDA', () => {
		const out = page([]);
		expect(out).toContain(`action="?week=${MON}&amp;/log"`);
		expect(out).toContain(`action="?week=${MON}&amp;/goals"`);
		expect(out).toContain('USDA FoodData Central');
	});
});
