import { fail, redirect } from '@sveltejs/kit';
import { formatServings } from '$lib/domain/format';
import { isIsoDate, parseWeekParam, todayIso, weekDays } from '$lib/domain/plan';
import {
	parseCookForm,
	parseEntryUpdate,
	parseFoodForm,
	parseLeftoverForm
} from '$lib/domain/plan-form';
import { requireUserId } from '$lib/server/auth';
import { getPlanStore, type PlanResult } from '$lib/server/plan';
import { getRecipeStore } from '$lib/server/recipes';

export const load = async ({ locals, url }) => {
	const userId = requireUserId(locals);
	const today = todayIso();
	const week = url.searchParams.get('week');
	const { monday, redirect: canonical } = parseWeekParam(week, today);
	if (canonical) throw redirect(307, `/plan?week=${monday}`);

	const plan = getPlanStore();
	const [entries, recipes, batches] = await Promise.all([
		plan.getWeek(userId, monday),
		getRecipeStore().list(userId),
		plan.listBatches(userId, today)
	]);

	return {
		monday,
		days: weekDays(monday),
		today,
		/** False when the week came from the server's (UTC) date, so the browser may correct it. */
		explicitWeek: isIsoDate(week),
		entries,
		recipes: recipes
			.map(({ id, title, servings }) => ({ id, title, servings }))
			.sort((a, b) => a.title.localeCompare(b.title)),
		batches: batches.filter((b) => b.state === 'fridge')
	};
};

const NOT_FOUND = 'That is no longer on your plan or shelf. Refresh the page and try again.';

/** Turns a store refusal into the field errors the Add dialog shows. */
const refusal = (action: string, result: Exclude<PlanResult<unknown>, { ok: true }>) => {
	switch (result.reason) {
		case 'not_found':
			return fail(404, { action, errors: { form: NOT_FOUND } });
		case 'before_cook':
			return fail(400, { action, errors: { batchId: 'Leftovers must come after the cook.' } });
		case 'not_enough':
			return fail(409, {
				action,
				errors: {
					servings:
						result.free === 0
							? 'No servings are free in this batch.'
							: `Only ${formatServings(result.free)} ${result.free === 1 ? 'is' : 'are'} free.`
				}
			});
		case 'below_drawn':
			return fail(409, {
				action,
				errors: {
					cooked: `${formatServings(result.drawn)} ${result.drawn === 1 ? 'is' : 'are'} already planned as leftovers. Cook at least that many more than you eat.`
				}
			});
		case 'bad_unit':
			return fail(400, { action, errors: { unit: 'Choose a unit this food has.' } });
		case 'gone':
			return fail(409, { action, errors: { form: 'That batch was thrown out.' } });
		case 'changed':
			return fail(409, {
				action,
				errors: { form: 'This entry changed in the meantime. Refresh the page and try again.' }
			});
		case 'has_leftovers':
			return fail(409, { action, errors: {}, draws: result.draws });
	}
};

export const actions = {
	addCook: async ({ locals, request }) => {
		const userId = requireUserId(locals);
		const parsed = parseCookForm(await request.formData());
		if (!parsed.ok) return fail(400, { action: 'addCook', errors: parsed.errors });
		const result = await getPlanStore().addCook(userId, parsed.value);
		return result.ok ? { action: 'addCook', ok: true } : refusal('addCook', result);
	},

	addLeftover: async ({ locals, request }) => {
		const userId = requireUserId(locals);
		const parsed = parseLeftoverForm(await request.formData());
		if (!parsed.ok) return fail(400, { action: 'addLeftover', errors: parsed.errors });
		const result = await getPlanStore().addLeftover(userId, parsed.value);
		return result.ok ? { action: 'addLeftover', ok: true } : refusal('addLeftover', result);
	},

	/** Adds a food, creating it as the user's custom food in the same step when the form says so. */
	addFood: async ({ locals, request }) => {
		const userId = requireUserId(locals);
		const parsed = parseFoodForm(await request.formData());
		if (!parsed.ok) return fail(400, { action: 'addFood', errors: parsed.errors });
		const result = await getPlanStore().addFood(userId, parsed.value);
		return result.ok ? { action: 'addFood', ok: true } : refusal('addFood', result);
	},

	updateEntry: async ({ locals, request }) => {
		const userId = requireUserId(locals);
		const parsed = parseEntryUpdate(await request.formData());
		if (!parsed.ok) return fail(400, { action: 'updateEntry', errors: parsed.errors });
		const result = await getPlanStore().updateEntry(
			userId,
			parsed.value.entryId,
			parsed.value.update
		);
		return result.ok ? { action: 'updateEntry', ok: true } : refusal('updateEntry', result);
	},

	/** Removes an entry. A cook with planned leftovers comes back with them unless `confirm=1`. */
	removeEntry: async ({ locals, request }) => {
		const userId = requireUserId(locals);
		const data = await request.formData();
		const entryId = String(data.get('entryId') ?? '');
		const result = await getPlanStore().removeEntry(userId, entryId, data.get('confirm') === '1');
		return result.ok ? { action: 'removeEntry', ok: true } : refusal('removeEntry', result);
	}
};
