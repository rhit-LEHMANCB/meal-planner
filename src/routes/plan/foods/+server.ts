import { json } from '@sveltejs/kit';
import { requireUserId } from '$lib/server/auth';
import { getFoodStore, withNutrition } from '$lib/server/foods';

// Lives under /plan, not /api: /api/* is public, and this must only answer signed-in users.
export const GET = async ({ locals, url }) => {
	const userId = requireUserId(locals);
	const query = (url.searchParams.get('q') ?? '').slice(0, 120);
	const store = getFoodStore();
	// Numbers ride along so recipe forms can preview nutrition; the plan dialog ignores them.
	return json({ foods: await withNutrition(store, userId, await store.search(userId, query)) });
};
