import { json } from '@sveltejs/kit';
import { requireUserId } from '$lib/server/auth';
import { SUGGEST_MAX } from '$lib/domain/food-match';
import { getFoodStore } from '$lib/server/foods';

// Under /recipes, not the public /api/*: only signed-in users get suggestions, from foods they can see.
export const GET = async ({ locals, url }) => {
	const userId = requireUserId(locals);
	const names = url.searchParams
		.getAll('name')
		.slice(0, SUGGEST_MAX)
		.map((n) => n.slice(0, 120));
	const foods = await getFoodStore().suggest(userId, names);
	return json({ suggestions: foods });
};
