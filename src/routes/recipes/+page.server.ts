import { requireUserId } from '$lib/server/auth';
import { getRecipeStore } from '$lib/server/recipes';

export const load = async ({ locals, url }) => {
	const userId = requireUserId(locals);
	const q = (url.searchParams.get('q') ?? '').trim();
	const store = getRecipeStore();

	// The unfiltered list gives the "2 of 9" count and tells an empty shelf from a search with no hits.
	const [all, recipes] = await Promise.all([
		store.list(userId),
		q ? store.list(userId, q) : undefined
	]);

	return { q, total: all.length, recipes: recipes ?? all };
};
