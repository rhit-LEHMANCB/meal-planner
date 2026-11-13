import { fail, redirect } from '@sveltejs/kit';
import { parseGoalsForm, parseLogForm, parseLogId } from '$lib/domain/nutrition-form';
import { buildNutritionView } from '$lib/domain/nutrition-view';
import { isIsoDate, parseWeekParam, todayIso, weekDays } from '$lib/domain/plan';
import { requireUserId } from '$lib/server/auth';
import { getNutritionStore } from '$lib/server/nutrition';
import { getPlanStore } from '$lib/server/plan';
import { getRecipeStore } from '$lib/server/recipes';

/** The week an action applies to: the form's hidden `week` field, which must be a Monday. */
const weekOf = (data: FormData): string | null => {
	const week = data.get('week');
	if (!isIsoDate(week)) return null;
	const { monday, redirect } = parseWeekParam(week, todayIso());
	return redirect ? null : monday;
};

const BAD_WEEK = 'This page is out of date. Refresh it and try again.';

export const load = async ({ locals, url }) => {
	const userId = requireUserId(locals);
	const today = todayIso();
	const week = url.searchParams.get('week');
	const { monday, redirect: canonical } = parseWeekParam(week, today);
	if (canonical) throw redirect(307, `/nutrition?week=${monday}`);

	const nutrition = getNutritionStore();
	const [entries, logs, goals, recipes] = await Promise.all([
		getPlanStore().getWeek(userId, monday),
		nutrition.logsForWeek(userId, monday),
		nutrition.getGoals(userId),
		getRecipeStore().list(userId)
	]);
	const days = weekDays(monday);
	return {
		monday,
		days,
		today,
		/** False when the week came from the server's (UTC) date, so the browser may correct it. */
		explicitWeek: isIsoDate(week),
		goals,
		view: buildNutritionView({
			days,
			today,
			planned: await nutrition.plannedNutrition(userId, entries),
			logs,
			goals
		}),
		recipes: recipes
			.map(({ id, title }) => ({ id, title }))
			.sort((a, b) => a.title.localeCompare(b.title))
	};
};

export const actions = {
	log: async ({ locals, request }) => {
		const userId = requireUserId(locals);
		const data = await request.formData();
		const monday = weekOf(data);
		if (!monday) return fail(400, { action: 'log', errors: { form: BAD_WEEK } });
		const form = parseLogForm(data, monday);
		if (!form.ok) return fail(400, { action: 'log', errors: form.errors });

		const result = await getNutritionStore().log(userId, form.value);
		if (!result.ok) {
			const field = form.value.kind === 'food' ? 'foodId' : 'recipeId';
			return result.reason === 'bad_unit'
				? fail(400, { action: 'log', errors: { unit: 'Choose one of this food’s units.' } })
				: fail(404, {
						action: 'log',
						errors: { [field]: 'That is no longer available. Pick another one.' }
					});
		}
		return { action: 'log', logged: true };
	},

	remove: async ({ locals, request }) => {
		const userId = requireUserId(locals);
		const id = parseLogId(await request.formData());
		const removed = id !== null && (await getNutritionStore().removeLog(userId, id));
		if (!removed) {
			return fail(404, {
				action: 'remove',
				errors: { form: 'That entry is already gone. Refresh the page.' }
			});
		}
		return { action: 'remove' };
	},

	goals: async ({ locals, request }) => {
		const userId = requireUserId(locals);
		const form = parseGoalsForm(await request.formData());
		if (!form.ok) return fail(400, { action: 'goals', errors: form.errors });
		await getNutritionStore().saveGoals(userId, form.value);
		return { action: 'goals', saved: true };
	}
};
