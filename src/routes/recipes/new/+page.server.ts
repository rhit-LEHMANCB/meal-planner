import { fail, redirect } from '@sveltejs/kit';
import { parseRecipeForm, type RecipeFormValues } from '$lib/domain/recipe-form';
import { requireUserId } from '$lib/server/auth';
import { getRecipeStore } from '$lib/server/recipes';

const EMPTY: RecipeFormValues = {
	title: '',
	servings: '',
	totalMinutes: '',
	sourceUrl: '',
	ingredients: '',
	steps: ''
};

export const load = () => ({ values: EMPTY });

export const actions = {
	default: async ({ request, locals }) => {
		const userId = requireUserId(locals);
		const result = parseRecipeForm(await request.formData());
		if (!result.ok) return fail(400, { errors: result.errors, values: result.values });

		const id = await getRecipeStore().create(userId, result.value);
		throw redirect(303, `/recipes/${id}`);
	}
};
