import { error, redirect } from '@sveltejs/kit';
import { requireUserId } from '$lib/server/auth';
import { getRecipeStore } from '$lib/server/recipes';

export const load = async ({ locals, params }) => {
	const recipe = await getRecipeStore().get(requireUserId(locals), params.id);
	// Someone else's recipe is indistinguishable from a missing one.
	if (!recipe) throw error(404, 'Recipe not found');
	return { recipe };
};

export const actions = {
	delete: async ({ locals, params }) => {
		const removed = await getRecipeStore().remove(requireUserId(locals), params.id);
		if (!removed) throw error(404, 'Recipe not found');
		throw redirect(303, '/recipes');
	}
};
