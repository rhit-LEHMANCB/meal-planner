import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_GOALS } from '$lib/domain/nutrition';

const nutrition = vi.hoisted(() => ({
	plannedNutrition: vi.fn(),
	logsForWeek: vi.fn(),
	getGoals: vi.fn(),
	log: vi.fn(),
	removeLog: vi.fn(),
	saveGoals: vi.fn()
}));
const plan = vi.hoisted(() => ({ getWeek: vi.fn() }));
const recipes = vi.hoisted(() => ({ list: vi.fn() }));

vi.mock('$lib/server/nutrition', () => ({ getNutritionStore: () => nutrition }));
vi.mock('$lib/server/plan', () => ({ getPlanStore: () => plan }));
vi.mock('$lib/server/recipes', () => ({ getRecipeStore: () => recipes }));

import { actions, load } from './+page.server';

const MON = '2030-02-04';
const ID = '6f1c1a52-6d0f-4d38-9a5c-2b0e7d0f8a11';
const signedIn = { userID: 'alice' } as App.Locals;

const post = (fields: Record<string, string>, locals = signedIn) => {
	const body = new FormData();
	for (const [k, v] of Object.entries(fields)) body.set(k, v);
	return {
		locals,
		request: new Request('http://localhost/nutrition', { method: 'POST', body })
	} as never;
};

const loadAt = (search: string, locals = signedIn) =>
	load({ locals, url: new URL(`http://localhost/nutrition${search}`) } as never);

const thrown = async (fn: () => Promise<unknown>) => {
	try {
		await fn();
	} catch (e) {
		return e as { status: number; location?: string };
	}
};

beforeEach(() => {
	vi.clearAllMocks();
	plan.getWeek.mockResolvedValue([]);
	nutrition.plannedNutrition.mockResolvedValue([
		{
			date: MON,
			nutrition: {
				macros: { kcal: 600, proteinG: 1, carbsG: 1, fatG: 1 },
				partial: false,
				part: 'planned'
			}
		}
	]);
	nutrition.logsForWeek.mockResolvedValue([]);
	nutrition.getGoals.mockResolvedValue(DEFAULT_GOALS);
	recipes.list.mockResolvedValue([
		{ id: 'b', title: 'Soup' },
		{ id: 'a', title: 'Chili' }
	]);
});

describe('load', () => {
	it('builds the week for the signed-in user', async () => {
		const data = await loadAt(`?week=${MON}`);
		expect(plan.getWeek).toHaveBeenCalledWith('alice', MON);
		expect(nutrition.logsForWeek).toHaveBeenCalledWith('alice', MON);
		expect(data.view.days[0].total.kcal).toBe(600);
		expect(data.recipes.map((r) => r.title)).toEqual(['Chili', 'Soup']);
		expect(data.goals).toEqual(DEFAULT_GOALS);
	});

	it('redirects a date that is not a Monday to its Monday', async () => {
		expect(await thrown(() => loadAt('?week=2030-02-06'))).toMatchObject({
			status: 307,
			location: `/nutrition?week=${MON}`
		});
	});

	it('sends signed-out visitors to sign in', async () => {
		expect(await thrown(() => loadAt(`?week=${MON}`, {} as App.Locals))).toMatchObject({
			status: 303,
			location: '/signin'
		});
		expect(plan.getWeek).not.toHaveBeenCalled();
	});
});

describe('log', () => {
	const food = {
		week: MON,
		kind: 'food',
		date: MON,
		slot: '',
		foodId: ID,
		amount: '1',
		unit: 'each'
	};

	it('logs a parsed entry for the user', async () => {
		nutrition.log.mockResolvedValue({ ok: true });
		expect(await actions.log(post(food))).toEqual({ action: 'log', logged: true });
		expect(nutrition.log).toHaveBeenCalledWith('alice', {
			kind: 'food',
			foodId: ID,
			amount: 1,
			unit: 'each',
			date: MON,
			slot: null
		});
	});

	it('refuses a non-Monday week, bad fields, missing items and bad units', async () => {
		expect(await actions.log(post({ ...food, week: '2030-02-05' }))).toMatchObject({ status: 400 });
		expect(await actions.log(post({ ...food, amount: '0' }))).toMatchObject({
			status: 400,
			data: { errors: { amount: 'Enter an amount greater than 0.' } }
		});
		expect(nutrition.log).not.toHaveBeenCalled();

		nutrition.log.mockResolvedValue({ ok: false, reason: 'not_found' });
		expect(await actions.log(post(food))).toMatchObject({
			status: 404,
			data: { errors: { foodId: expect.any(String) } }
		});
		nutrition.log.mockResolvedValue({ ok: false, reason: 'bad_unit' });
		expect(await actions.log(post(food))).toMatchObject({
			status: 400,
			data: { errors: { unit: expect.any(String) } }
		});
	});
});

describe('log limits', () => {
	it('shows an amount error when the entry is too large to store', async () => {
		nutrition.log.mockResolvedValue({ ok: false, reason: 'too_large' });
		const result = await actions.log(
			post({ week: MON, kind: 'food', date: MON, slot: '', foodId: ID, amount: '99999', unit: 'g' })
		);
		expect(result).toMatchObject({ status: 400, data: { errors: { amount: expect.any(String) } } });
	});
});

describe('remove', () => {
	it('deletes an own entry', async () => {
		nutrition.removeLog.mockResolvedValue(true);
		expect(await actions.remove(post({ logId: ID }))).toEqual({ action: 'remove' });
		expect(nutrition.removeLog).toHaveBeenCalledWith('alice', ID);
	});

	it('answers not found for a missing or foreign entry', async () => {
		nutrition.removeLog.mockResolvedValue(false);
		expect(await actions.remove(post({ logId: ID }))).toMatchObject({ status: 404 });
		expect(await actions.remove(post({ logId: 'x' }))).toMatchObject({ status: 404 });
	});
});

describe('goals', () => {
	it('saves valid goals and refuses invalid ones', async () => {
		const goals = { kcal: '1800', proteinG: '150', carbsG: '180', fatG: '60' };
		expect(await actions.goals(post(goals))).toEqual({ action: 'goals', saved: true });
		expect(nutrition.saveGoals).toHaveBeenCalledWith('alice', {
			kcal: 1800,
			proteinG: 150,
			carbsG: 180,
			fatG: 60
		});
		expect(await actions.goals(post({ ...goals, kcal: '100' }))).toMatchObject({
			status: 400,
			data: { errors: { kcal: 'Enter whole kcal from 500 to 10,000.' } }
		});
	});
});
