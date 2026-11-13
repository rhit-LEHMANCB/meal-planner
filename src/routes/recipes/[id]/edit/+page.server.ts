import { error, fail, redirect } from '@sveltejs/kit';
import { parseRecipeForm, recipeToFormValues } from '$lib/domain/recipe-form';
import { requireUserId } from '$lib/server/auth';
import { getFoodStore } from '$lib/server/foods';
import { getRecipeStore } from '$lib/server/recipes';

export const load = async ({ locals, params }) => {
	const userId = requireUserId(locals);
	const recipe = await getRecipeStore().get(userId, params.id);
	if (!recipe) throw error(404, 'Recipe not found');
	const linked = await getFoodStore().getMany(
		userId,
		recipe.ingredients.flatMap((i) => (i.foodId ? [i.foodId] : []))
	);
	return {
		id: recipe.id,
		values: recipeToFormValues(recipe),
		/** Units of linked foods, so the form knows which rows need a weight in grams. */
		foodUnits: Object.fromEntries(linked.map((f) => [f.id, f.units]))
	};
};

export const actions = {
	default: async ({ request, locals, params }) => {
		const userId = requireUserId(locals);
		const result = parseRecipeForm(await request.formData());
		if (!result.ok) return fail(400, { errors: result.errors, values: result.values });

		const store = getRecipeStore();
		const rows = await store.foodErrors(userId, result.value);
		if (Object.keys(rows).length > 0) {
			return fail(400, {
				errors: { rows, ingredients: 'Fix the highlighted ingredients.' },
				values: result.values
			});
		}

		const saved = await store.update(userId, params.id, result.value);
		if (!saved) throw error(404, 'Recipe not found');
		throw redirect(303, `/recipes/${params.id}`);
	}
};
