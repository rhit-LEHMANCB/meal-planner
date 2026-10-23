import { fail, redirect } from '@sveltejs/kit';
import { parseRecipeForm, rowStatus, type RecipeFormValues } from '$lib/domain/recipe-form';
import { draftToFormValues } from '$lib/domain/recipe-import';
import { getImporter, type ImportFailure, type ImportResult } from '$lib/server/ai/import';
import { requireUserId } from '$lib/server/auth';
import { DAILY_AI_IMPORTS, getImportUsage } from '$lib/server/import-usage';
import { getRecipeStore } from '$lib/server/recipes';

export type ImportSource = 'link' | 'text' | 'photo';
const SOURCES: ImportSource[] = ['link', 'text', 'photo'];

/** How the review screen describes where the draft came from. */
export interface ReviewInfo {
	via: 'structured' | 'ai' | null;
	ingredientCount: number;
	needsCheck: number;
	droppedIngredients: number;
	droppedSteps: number;
}

export const load = async ({ locals, url }) => {
	const userId = requireUserId(locals);
	const asked = url.searchParams.get('source') as ImportSource | null;
	return {
		source: asked && SOURCES.includes(asked) ? asked : ('link' as ImportSource),
		aiLeft: await getImportUsage().remainingToday(userId),
		dailyLimit: DAILY_AI_IMPORTS
	};
};

const MESSAGES: Record<ImportFailure, string> = {
	'link-invalid':
		'That link cannot be imported. Use a web address that starts with http:// or https://.',
	'link-refused': 'That link cannot be imported. Only public web pages can be read.',
	'link-unreadable':
		'We could not read a recipe from that page. Some sites do not allow it. Paste the recipe text instead.',
	cooldown: 'Please wait a few seconds before starting another import.',
	'daily-limit': `You have used all ${DAILY_AI_IMPORTS} AI imports for today. The limit resets at midnight UTC. Links to pages with recipe data still work, and you can always add a recipe by hand.`,
	'text-empty': 'Paste the recipe text to import.',
	'text-too-long': 'That text is too long. Paste at most 20,000 characters.',
	'photo-missing': 'Choose a photo of the recipe.',
	'photo-type': 'That file is not a photo we can read. Use a JPEG, PNG or WebP image.',
	'photo-too-large': 'That photo is larger than 5 MB. Try a smaller one.',
	'no-recipe': 'No recipe was found in that. Check it and try again, or add the recipe by hand.',
	unavailable: 'Recipe import is unavailable right now. Try again in a minute.'
};

const STATUS: Record<ImportFailure, number> = {
	'link-invalid': 400,
	'link-refused': 400,
	'link-unreadable': 422,
	cooldown: 429,
	'daily-limit': 429,
	'text-empty': 400,
	'text-too-long': 400,
	'photo-missing': 400,
	'photo-type': 415,
	'photo-too-large': 413,
	'no-recipe': 422,
	unavailable: 503
};

const field = (data: FormData, name: string) => {
	const value = data.get(name);
	return typeof value === 'string' ? value : '';
};

/** Turns an import result into the page's form state: the review, or the error and what was typed. */
const respond = (
	source: ImportSource,
	result: ImportResult,
	typed: { link?: string; text?: string; sourceUrl?: string }
) => {
	if (!result.ok) {
		return fail(STATUS[result.reason], {
			source,
			reason: result.reason,
			message: MESSAGES[result.reason],
			link: typed.link ?? '',
			text: typed.text ?? '',
			sourceUrl: typed.sourceUrl ?? ''
		});
	}
	const values = draftToFormValues(result.draft);
	const info: ReviewInfo = {
		via: result.via,
		ingredientCount: values.ingredients.length,
		needsCheck: values.ingredients.filter((row) => rowStatus(row) === 'check').length,
		droppedIngredients: result.droppedIngredients,
		droppedSteps: result.droppedSteps
	};
	return { source, review: { values, info } };
};

export const actions = {
	link: async ({ request, locals }) => {
		const userId = requireUserId(locals);
		const link = field(await request.formData(), 'link').trim();
		return respond('link', await getImporter().fromLink(userId, link), { link });
	},

	text: async ({ request, locals }) => {
		const userId = requireUserId(locals);
		const data = await request.formData();
		const text = field(data, 'text');
		const sourceUrl = field(data, 'sourceUrl');
		return respond('text', await getImporter().fromText(userId, text, sourceUrl || null), {
			text,
			sourceUrl
		});
	},

	photo: async ({ request, locals }) => {
		const userId = requireUserId(locals);
		const photo = (await request.formData()).get('photo');
		return respond(
			'photo',
			await getImporter().fromPhoto(userId, photo instanceof File ? photo : null),
			{}
		);
	},

	/** Saves the reviewed recipe. The review's values are untrusted and validated like any recipe. */
	save: async ({ request, locals }) => {
		const userId = requireUserId(locals);
		const result = parseRecipeForm(await request.formData());
		if (!result.ok) {
			const values: RecipeFormValues = result.values;
			return fail(400, {
				review: {
					values,
					// The draft's origin is not posted back, so its "structured data" or "AI parsed"
					// notice is not repeated; the field errors are what matter now.
					info: {
						via: null,
						ingredientCount: values.ingredients.length,
						needsCheck: values.ingredients.filter((row) => rowStatus(row) === 'check').length,
						droppedIngredients: 0,
						droppedSteps: 0
					} satisfies ReviewInfo
				},
				errors: result.errors
			});
		}
		const id = await getRecipeStore().create(userId, result.value);
		throw redirect(303, `/recipes/${id}`);
	}
};
