import { htmlToPlainText } from './html-text';
import { parseIngredientLine } from './ingredient-line';
import type { ImportDraft } from './recipe-import';

const text = (value: unknown): string => (typeof value === 'string' ? htmlToPlainText(value) : '');

/** The first whole number in a yield such as 6, "6", "6 servings", "4-6" or ["6", "6 bowls"]. */
export const parseYield = (value: unknown): number | null => {
	if (Array.isArray(value)) {
		for (const item of value) {
			const n = parseYield(item);
			if (n !== null) return n;
		}
		return null;
	}
	if (typeof value === 'number') return Number.isInteger(value) && value > 0 ? value : null;
	if (typeof value === 'string') {
		const match = value.match(/\d+/);
		const n = match ? Number(match[0]) : 0;
		return n > 0 ? n : null;
	}
	return null;
};

/** Minutes in an ISO 8601 duration ("PT1H30M", "P0DT45M"), or null if it is not one or is zero. */
export const parseDurationMinutes = (value: unknown): number | null => {
	if (typeof value !== 'string') return null;
	const match = value
		.trim()
		.match(
			/^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i
		);
	if (!match) return null;
	const [, d, h, m, s] = match.map((part) => Number(part ?? 0));
	const minutes = Math.round(d * 1440 + h * 60 + m + s / 60);
	return minutes > 0 ? minutes : null;
};

/** Steps from any of the shapes sites use: a string, strings, HowToStep objects or HowToSections. */
const collectSteps = (value: unknown): string[] => {
	if (typeof value === 'string') {
		// One string can hold several steps as list items or lines.
		const items = [...value.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map((m) => m[1]);
		const parts = items.length > 0 ? items : value.split(/\r?\n|<br\s*\/?>|<\/p>/i);
		return parts.map(htmlToPlainText).filter(Boolean);
	}
	if (Array.isArray(value)) return value.flatMap(collectSteps);
	if (value && typeof value === 'object') {
		const obj = value as Record<string, unknown>;
		if (obj.itemListElement) return collectSteps(obj.itemListElement);
		const stepText = text(obj.text) || text(obj.name);
		return stepText ? [stepText] : [];
	}
	return [];
};

/** Turns a schema.org Recipe object into a draft. Null when it holds no title and no ingredients. */
export const recipeFromJsonLd = (
	recipe: Record<string, unknown>,
	sourceUrl: string | null
): ImportDraft | null => {
	const title = text(recipe.name) || text(recipe.headline);
	const rawIngredients = recipe.recipeIngredient ?? recipe.ingredients;
	const lines = (Array.isArray(rawIngredients) ? rawIngredients : [rawIngredients])
		.map(text)
		.filter(Boolean);
	if (!title && lines.length === 0) return null;

	const prep = parseDurationMinutes(recipe.prepTime);
	const cook = parseDurationMinutes(recipe.cookTime);

	return {
		title,
		servings: parseYield(recipe.recipeYield),
		totalMinutes:
			parseDurationMinutes(recipe.totalTime) ??
			(prep !== null || cook !== null ? (prep ?? 0) + (cook ?? 0) : null),
		sourceUrl,
		ingredients: lines.map(parseIngredientLine),
		steps: collectSteps(recipe.recipeInstructions)
	};
};
