import { z } from 'zod';

export const LIMITS = {
	titleMax: 200,
	servingsMax: 99,
	totalMinutesMax: 1440,
	ingredientsMax: 100,
	ingredientLineMax: 300,
	stepsMax: 50,
	stepMax: 2000
} as const;

/** One item per line, trimmed, blank lines dropped. */
export const parseLines = (text: string): string[] =>
	text
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0);

const isWholeNumber = (value: string, min: number, max: number) =>
	/^\d+$/.test(value) && Number(value) >= min && Number(value) <= max;

const isHttpUrl = (value: string) => {
	try {
		const { protocol } = new URL(value);
		return protocol === 'http:' || protocol === 'https:';
	} catch {
		return false;
	}
};

const lines = (label: string, maxCount: number, maxLength: number) =>
	z.string().refine((text) => {
		const items = parseLines(text);
		return items.length <= maxCount && items.every((item) => item.length <= maxLength);
	}, `${label}: at most ${maxCount} lines, each ${maxLength} characters or fewer.`);

const schema = z.object({
	title: z
		.string()
		.trim()
		.min(1, 'Title is required.')
		.max(LIMITS.titleMax, `Title must be ${LIMITS.titleMax} characters or fewer.`),
	servings: z
		.string()
		.trim()
		.refine(
			(v) => isWholeNumber(v, 1, LIMITS.servingsMax),
			`Servings must be a whole number from 1 to ${LIMITS.servingsMax}.`
		),
	totalMinutes: z
		.string()
		.trim()
		.refine(
			(v) => v === '' || isWholeNumber(v, 1, LIMITS.totalMinutesMax),
			`Total time must be a whole number of minutes from 1 to ${LIMITS.totalMinutesMax}.`
		),
	sourceUrl: z
		.string()
		.trim()
		.refine(
			(v) => v === '' || isHttpUrl(v),
			'That link does not look right. Start it with http:// or https://.'
		),
	ingredients: lines('Ingredients', LIMITS.ingredientsMax, LIMITS.ingredientLineMax),
	steps: lines('Steps', LIMITS.stepsMax, LIMITS.stepMax)
});

export type RecipeField = keyof z.infer<typeof schema>;

/** A validated recipe, ready to save. */
export interface RecipeInput {
	title: string;
	servings: number;
	totalMinutes: number | null;
	sourceUrl: string | null;
	ingredients: string[];
	steps: string[];
}

/** The form's text exactly as typed, used to refill the form after an error. */
export type RecipeFormValues = Record<RecipeField, string>;

export type RecipeFormResult =
	| { ok: true; value: RecipeInput }
	| { ok: false; errors: Partial<Record<RecipeField, string>>; values: RecipeFormValues };

const text = (data: { get(name: string): unknown }, name: RecipeField) => {
	const value = data.get(name);
	return typeof value === 'string' ? value : '';
};

/** Validates the recipe form (a `FormData` or anything with `get`). */
export const parseRecipeForm = (data: { get(name: string): unknown }): RecipeFormResult => {
	const values: RecipeFormValues = {
		title: text(data, 'title'),
		servings: text(data, 'servings'),
		totalMinutes: text(data, 'totalMinutes'),
		sourceUrl: text(data, 'sourceUrl'),
		ingredients: text(data, 'ingredients'),
		steps: text(data, 'steps')
	};

	const parsed = schema.safeParse(values);
	if (!parsed.success) {
		const errors: Partial<Record<RecipeField, string>> = {};
		for (const issue of parsed.error.issues) {
			const field = issue.path[0] as RecipeField;
			errors[field] ??= issue.message;
		}
		return { ok: false, errors, values };
	}

	const v = parsed.data;
	return {
		ok: true,
		value: {
			title: v.title,
			servings: Number(v.servings),
			totalMinutes: v.totalMinutes === '' ? null : Number(v.totalMinutes),
			sourceUrl: v.sourceUrl === '' ? null : v.sourceUrl,
			ingredients: parseLines(v.ingredients),
			steps: parseLines(v.steps)
		}
	};
};

/** Turns a saved recipe back into form text for the edit page. */
export const recipeToFormValues = (recipe: {
	title: string;
	servings: number;
	totalMinutes: number | null;
	sourceUrl: string | null;
	ingredients: string[];
	instructions: string[];
}): RecipeFormValues => ({
	title: recipe.title,
	servings: String(recipe.servings),
	totalMinutes: recipe.totalMinutes === null ? '' : String(recipe.totalMinutes),
	sourceUrl: recipe.sourceUrl ?? '',
	ingredients: recipe.ingredients.join('\n'),
	steps: recipe.instructions.join('\n')
});
