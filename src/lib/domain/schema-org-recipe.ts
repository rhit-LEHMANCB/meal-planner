import { htmlToPlainText } from './html-text';
import { parseIngredientLine } from './ingredient-line';
import type { ImportDraft } from './recipe-import';

// Values are capped before any pattern runs on them: JSON-LD comes from untrusted pages.
const MAX_FIELD = 2000;
const MAX_INSTRUCTIONS = 20_000;

const text = (value: unknown): string =>
	typeof value === 'string' ? htmlToPlainText(value.slice(0, MAX_FIELD)) : '';

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

/**
 * Steps from any of the shapes sites use: a string, strings, HowToStep objects or HowToSections.
 * All step strings share one MAX_INSTRUCTIONS budget, so many long strings cannot add up.
 */
const collectSteps = (value: unknown): string[] => {
	let budget = MAX_INSTRUCTIONS;
	const take = (s: string) => {
		const part = s.slice(0, Math.max(budget, 0));
		budget -= part.length;
		return part;
	};

	const walk = (node: unknown, depth: number): string[] => {
		if (budget <= 0 || depth > 8) return [];
		if (typeof node === 'string') {
			// One string can hold several steps as list items or lines.
			const capped = take(node);
			const items = [...capped.matchAll(/<li[^<>]*>([\s\S]*?)<\/li>/gi)].map((m) => m[1]);
			const parts = items.length > 0 ? items : capped.split(/\r?\n|<br\s*\/?>|<\/p>/i);
			return parts.map(htmlToPlainText).filter(Boolean);
		}
		if (Array.isArray(node)) return node.flatMap((item) => walk(item, depth + 1));
		if (node && typeof node === 'object') {
			const obj = node as Record<string, unknown>;
			if (obj.itemListElement) return walk(obj.itemListElement, depth + 1);
			const raw = typeof obj.text === 'string' ? obj.text : obj.name;
			const stepText = typeof raw === 'string' ? htmlToPlainText(take(raw)) : '';
			return stepText ? [stepText] : [];
		}
		return [];
	};
	return walk(value, 0);
};

/**
 * Turns a schema.org Recipe object into a draft. Null when it holds no ingredients and no steps
 * (a stub on a listing page, say), so the import tries the page text instead.
 */
export const recipeFromJsonLd = (
	recipe: Record<string, unknown>,
	sourceUrl: string | null
): ImportDraft | null => {
	const title = text(recipe.name) || text(recipe.headline);
	const rawIngredients = recipe.recipeIngredient ?? recipe.ingredients;
	const lines = (Array.isArray(rawIngredients) ? rawIngredients : [rawIngredients])
		.map(text)
		.filter(Boolean);
	const steps = collectSteps(recipe.recipeInstructions);
	if (lines.length === 0 && steps.length === 0) return null;

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
		steps
	};
};
