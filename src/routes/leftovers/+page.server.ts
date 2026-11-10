import { fail } from '@sveltejs/kit';
import { todayIso } from '$lib/domain/plan';
import { requireUserId } from '$lib/server/auth';
import { getPlanStore } from '$lib/server/plan';

export const load = async ({ locals }) => {
	const userId = requireUserId(locals);
	const batches = await getPlanStore().listBatches(userId, todayIso());
	return {
		fridge: batches.filter((b) => b.state === 'fridge'),
		// Most recently gone first.
		gone: batches
			.filter((b) => b.state !== 'fridge')
			.sort((a, b) => (b.leftOn ?? '').localeCompare(a.leftOn ?? ''))
	};
};

export const actions = {
	throwOut: async ({ locals, request }) => {
		const userId = requireUserId(locals);
		const batchId = String((await request.formData()).get('batchId') ?? '');
		const result = await getPlanStore().throwOut(userId, batchId);
		// Someone else's batch is indistinguishable from a missing one.
		if (!result.ok) return fail(404, { error: 'That batch no longer exists.' });
		return { ok: true };
	}
};
