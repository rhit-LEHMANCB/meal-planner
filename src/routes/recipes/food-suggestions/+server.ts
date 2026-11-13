import { json } from '@sveltejs/kit';
import { requireUserId } from '$lib/server/auth';
import { SUGGEST_MAX } from '$lib/domain/food-match';
import { getFoodStore, withNutrition } from '$lib/server/foods';

// Under /recipes, not the public /api/*: only signed-in users get suggestions, from foods they can
// see. `name` = ingredient names to suggest a food for; `id` = linked foods whose units are needed.
export const GET = async ({ locals, url }) => {
	const userId = requireUserId(locals);
	const names = url.searchParams
		.getAll('name')
		.slice(0, SUGGEST_MAX)
		.map((n) => n.slice(0, 120));
	const ids = url.searchParams.getAll('id').slice(0, SUGGEST_MAX);
	const store = getFoodStore();
	const [suggestions, foods] = await Promise.all([
		store.suggest(userId, names),
		store.getMany(userId, ids)
	]);
	// Numbers ride along for the nutrition preview; `foods` also gives linked rows their units.
	const found = suggestions.flatMap((s) => (s ? [s] : []));
	const withNumbers = await withNutrition(store, userId, [...found, ...foods]);
	const numbered = (id: string) => withNumbers.find((f) => f.id === id) ?? null;
	return json({
		suggestions: suggestions.map((s) => (s ? numbered(s.id) : null)),
		foods: foods.map((f) => numbered(f.id))
	});
};
