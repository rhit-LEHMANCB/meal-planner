import { error, redirect } from '@sveltejs/kit';
import { recipeNutrition, rowCounts, type IngredientForNutrition } from '$lib/domain/nutrition';
import { requireUserId } from '$lib/server/auth';
import { getFoodStore } from '$lib/server/foods';
import { getRecipeStore } from '$lib/server/recipes';

export const load = async ({ locals, params }) => {
	const userId = requireUserId(locals);
	const recipe = await getRecipeStore().get(userId, params.id);
	// Someone else's recipe is indistinguishable from a missing one.
	if (!recipe) throw error(404, 'Recipe not found');

	const rows: IngredientForNutrition[] = recipe.ingredients.map((i) => ({
		name: i.name,
		quantity: i.quantity,
		unit: i.unit,
		foodId: i.foodId ?? null,
		grams: i.grams ?? null,
		gramsSource: i.gramsSource ?? null
	}));
	const foods = await getFoodStore().nutritionFor(
		userId,
		rows.flatMap((r) => (r.foodId ? [r.foodId] : []))
	);
	return {
		recipe,
		nutrition: {
			...recipeNutrition(rows, foods, recipe.servings),
			/** Per ingredient row, in order: whether it counts toward nutrition. */
			rows: rows.map((r) => rowCounts(r, foods))
		}
	};
};

export const actions = {
	delete: async ({ locals, params }) => {
		const removed = await getRecipeStore().remove(requireUserId(locals), params.id);
		if (!removed) throw error(404, 'Recipe not found');
		throw redirect(303, '/recipes');
	}
};
