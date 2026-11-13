import { beforeEach, describe, expect, it, vi } from 'vitest';

const plan = vi.hoisted(() => ({ getWeek: vi.fn(), listBatches: vi.fn() }));
const nutrition = vi.hoisted(() => ({ plannedNutrition: vi.fn(), logsForWeek: vi.fn() }));
const recipes = vi.hoisted(() => ({ list: vi.fn() }));

vi.mock('$lib/server/plan', () => ({ getPlanStore: () => plan }));
vi.mock('$lib/server/nutrition', () => ({ getNutritionStore: () => nutrition }));
vi.mock('$lib/server/recipes', () => ({ getRecipeStore: () => recipes }));

import { load } from './+page.server';

const MON = '2030-02-04';
const TUE = '2030-02-05';

beforeEach(() => {
	vi.clearAllMocks();
	plan.getWeek.mockResolvedValue([{ id: 'e1' }]);
	plan.listBatches.mockResolvedValue([]);
	recipes.list.mockResolvedValue([]);
	nutrition.plannedNutrition.mockResolvedValue([
		{
			date: MON,
			nutrition: {
				macros: { kcal: 395, proteinG: 0, carbsG: 0, fatG: 0 },
				partial: true,
				part: 'planned'
			}
		}
	]);
	// A logged entry on Tuesday must never show on the plan.
	nutrition.logsForWeek.mockResolvedValue([
		{
			id: 'l1',
			date: TUE,
			slot: null,
			label: 'Apple',
			macros: { kcal: 95, proteinG: 0, carbsG: 0, fatG: 0 }
		}
	]);
});

describe('plan load day totals', () => {
	it('totals planned entries only, and leaves days without entries out', async () => {
		const data = await load({
			locals: { userID: 'alice' } as App.Locals,
			url: new URL(`http://localhost/plan?week=${MON}`)
		} as never);
		expect(nutrition.plannedNutrition).toHaveBeenCalledWith('alice', [{ id: 'e1' }]);
		expect(data.dayKcal).toEqual({ [MON]: { kcal: 395, partial: true } });
		expect(nutrition.logsForWeek).not.toHaveBeenCalled();
	});
});
