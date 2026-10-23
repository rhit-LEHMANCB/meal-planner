import { error, fail, redirect } from '@sveltejs/kit';
import { parseRecipeForm, recipeToFormValues } from '$lib/domain/recipe-form';
import { requireUserId } from '$lib/server/auth';
import { getRecipeStore } from '$lib/server/recipes';

export const load = async ({ locals, params }) => {
	const recipe = await getRecipeStore().get(requireUserId(locals), params.id);
	if (!recipe) throw error(404, 'Recipe not found');
	return { id: recipe.id, values: recipeToFormValues(recipe) };
};

export const actions = {
	default: async ({ request, locals, params }) => {
		const userId = requireUserId(locals);
		const result = parseRecipeForm(await request.formData());
		if (!result.ok) return fail(400, { errors: result.errors, values: result.values });

		const saved = await getRecipeStore().update(userId, params.id, result.value);
		if (!saved) throw error(404, 'Recipe not found');
		throw redirect(303, `/recipes/${params.id}`);
	}
};
