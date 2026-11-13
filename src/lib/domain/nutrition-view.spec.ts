import { describe, expect, it } from 'vitest';
import { DEFAULT_GOALS } from './nutrition';
import { buildNutritionView } from './nutrition-view';
import { weekDays } from './plan';

const MON = '2026-11-09';
const m = (kcal: number, proteinG = 0) => ({ kcal, proteinG, carbsG: 0, fatG: 0 });

describe('buildNutritionView', () => {
	it('splits days, shows today against goals and lists logs by day', () => {
		const view = buildNutritionView({
			days: weekDays(MON),
			today: '2026-11-10',
			planned: [
				{ date: MON, nutrition: { macros: m(1800), partial: false, part: 'planned' } },
				{ date: '2026-11-10', nutrition: { macros: m(1000, 100), partial: true, part: 'leftover' } }
			],
			logs: [{ id: 'l1', date: '2026-11-10', slot: null, label: 'Apple · 1 each', macros: m(540) }],
			goals: DEFAULT_GOALS
		});
		expect(view.days[1]).toMatchObject({ partial: true });
		expect(view.days[1].leftover.kcal).toBe(1000);
		expect(view.days[1].logged.kcal).toBe(540);
		expect(view.today).toMatchObject({
			date: '2026-11-10',
			kcal: { value: 1540, left: 460, percent: 77 },
			proteinG: { value: 100, goal: 140 },
			partial: true
		});
		expect(view.average?.kcal).toBe(1670);
		expect(view.logsByDay).toEqual([
			{ date: '2026-11-10', logs: [expect.objectContaining({ id: 'l1' })] }
		]);
		expect(view.chartMax).toBe(2500);
		expect(view.empty).toBe(false);
	});

	it('has no today card for another week, and room for a big day in the chart', () => {
		const view = buildNutritionView({
			days: weekDays(MON),
			today: '2026-12-01',
			planned: [{ date: MON, nutrition: { macros: m(4000), partial: false, part: 'planned' } }],
			logs: [],
			goals: DEFAULT_GOALS
		});
		expect(view.today).toBeNull();
		expect(view.chartMax).toBe(4400);
	});

	it('is empty for a week with nothing planned or logged', () => {
		const view = buildNutritionView({
			days: weekDays(MON),
			today: MON,
			planned: [],
			logs: [],
			goals: DEFAULT_GOALS
		});
		expect(view).toMatchObject({ empty: true, average: null, logsByDay: [] });
		expect(view.today?.kcal).toMatchObject({ value: 0, left: 2000 });
	});
});
