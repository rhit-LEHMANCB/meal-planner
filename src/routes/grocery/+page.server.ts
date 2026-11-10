import { fail, redirect } from '@sveltejs/kit';
import { buildGroceryList, nameKey, serializeAmounts } from '$lib/domain/grocery';
import {
	GROCERY_LIMITS,
	parseAisleForm,
	parseExtraForm,
	parseExtraTickForm,
	parseRemoveForm,
	parseTickForm
} from '$lib/domain/grocery-form';
import { buildGroceryView } from '$lib/domain/grocery-view';
import { isIsoDate, parseWeekParam, todayIso } from '$lib/domain/plan';
import { requireUserId } from '$lib/server/auth';
import { getGroceryStore } from '$lib/server/grocery';

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
	if (canonical) throw redirect(307, `/grocery?week=${monday}`);

	const data = await getGroceryStore().getWeek(userId, monday);
	return {
		monday,
		today,
		/** False when the week came from the server's (UTC) date, so the browser may correct it. */
		explicitWeek: isIsoDate(week),
		view: buildGroceryView(data)
	};
};

const NOT_FOUND = 'That item is no longer on your list. Refresh the page and try again.';

export const actions = {
	/** Ticks or unticks a derived item; the server works out the amounts it covers. */
	tick: async ({ locals, request }) => {
		const userId = requireUserId(locals);
		const data = await request.formData();
		const form = parseTickForm(data);
		if (!form.ok) return fail(400, { action: 'tick', errors: form.errors });

		const monday = weekOf(data);
		if (!monday) return fail(400, { action: 'tick', errors: { form: BAD_WEEK } });
		const store = getGroceryStore();
		const items = buildGroceryList((await store.getWeek(userId, monday)).sources);
		const item = items.find((i) => i.key === form.value.key);
		if (!item && form.value.checked) {
			return fail(404, { action: 'tick', errors: { form: NOT_FOUND } });
		}
		await store.setTick(
			userId,
			monday,
			{
				key: form.value.key,
				name: item?.name ?? form.value.key,
				snapshot: form.value.checked && item ? serializeAmounts(item) : null
			},
			items.map((i) => i.key)
		);
		return { action: 'tick' };
	},

	add: async ({ locals, request }) => {
		const userId = requireUserId(locals);
		const data = await request.formData();
		const form = parseExtraForm(data);
		if (!form.ok) return fail(400, { action: 'add', errors: form.errors });

		const monday = weekOf(data);
		if (!monday) return fail(400, { action: 'add', errors: { form: BAD_WEEK } });
		const result = await getGroceryStore().addExtra(userId, monday, form.value);
		if (!result.ok) {
			return fail(409, {
				action: 'add',
				errors: {
					text: `A week can have at most ${GROCERY_LIMITS.extrasPerWeek} items you added.`
				}
			});
		}
		return { action: 'add', added: true };
	},

	extraTick: async ({ locals, request }) => {
		const userId = requireUserId(locals);
		const form = parseExtraTickForm(await request.formData());
		if (!form.ok) return fail(400, { action: 'extraTick', errors: form.errors });
		const result = await getGroceryStore().setExtraChecked(
			userId,
			form.value.id,
			form.value.checked
		);
		if (!result.ok) return fail(404, { action: 'extraTick', errors: { form: NOT_FOUND } });
		return { action: 'extraTick' };
	},

	remove: async ({ locals, request }) => {
		const userId = requireUserId(locals);
		const form = parseRemoveForm(await request.formData());
		if (!form.ok) return fail(400, { action: 'remove', errors: form.errors });
		const result = await getGroceryStore().removeExtra(userId, form.value.id);
		if (!result.ok) return fail(404, { action: 'remove', errors: { form: NOT_FOUND } });
		return { action: 'remove' };
	},

	aisle: async ({ locals, request }) => {
		const userId = requireUserId(locals);
		const form = parseAisleForm(await request.formData());
		if (!form.ok) return fail(400, { action: 'aisle', errors: form.errors });
		await getGroceryStore().setAisle(userId, nameKey(form.value.key), form.value.aisle);
		return { action: 'aisle' };
	}
};
