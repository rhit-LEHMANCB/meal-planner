import { json } from '@sveltejs/kit';
import { requireUserId } from '$lib/server/auth';
import { getFoodStore } from '$lib/server/foods';

// Lives under /plan, not /api: /api/* is public, and this must only answer signed-in users.
export const GET = async ({ locals, url }) => {
	const userId = requireUserId(locals);
	const query = (url.searchParams.get('q') ?? '').slice(0, 120);
	return json({ foods: await getFoodStore().search(userId, query) });
};
