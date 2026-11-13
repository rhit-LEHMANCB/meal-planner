// Turns ingredient names into food searches and applies AI matches to rows. Pure.
import { parseAmount } from './ingredient-line';
import { unitConverts } from './nutrition';

/** At most this many ingredient names per suggestion request. */
export const SUGGEST_MAX = 50;

/** "eggs" → "egg", "tomatoes" → "tomato", "berries" → "berr": a stem that still matches by substring. */
export const searchStem = (word: string): string => {
	const w = word.toLowerCase();
	if (w.length > 4 && /(oes|ches|shes|sses|xes)$/.test(w)) return w.slice(0, -2);
	if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3);
	if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
	return w;
};

/** Words in ingredient names that describe preparation or size rather than the food. */
const STOP_WORDS = new Set([
	'a',
	'an',
	'and',
	'or',
	'of',
	'the',
	'to',
	'for',
	'with',
	'about',
	'chopped',
	'diced',
	'minced',
	'sliced',
	'grated',
	'shredded',
	'crushed',
	'peeled',
	'cubed',
	'halved',
	'quartered',
	'trimmed',
	'melted',
	'softened',
	'divided',
	'packed',
	'fresh',
	'freshly',
	'finely',
	'roughly',
	'thinly',
	'large',
	'medium',
	'small',
	'big',
	'extra',
	'yellow',
	'organic',
	'optional',
	'taste',
	'room',
	'temperature'
]);

/**
 * The search for an ingredient name: the part before a comma or parenthesis, without numbers,
 * punctuation and stop words ("1 yellow onion, diced" → "onion"). Empty when nothing is left.
 */
export const suggestQuery = (name: string): string =>
	name
		.split(/[,(;]/)[0]
		.toLowerCase()
		.replace(/[^a-z\s'-]/g, ' ')
		.split(/\s+/)
		.map((w) => w.replace(/^['-]+|['-]+$/g, ''))
		.filter((w) => w.length > 1 && !STOP_WORDS.has(w))
		.join(' ');

/** Largest AI weight estimate kept for one ingredient row, in grams. */
export const AI_GRAMS_MAX = 5000;

/** A food the AI may link, as food search returns it. */
export interface MatchFood {
	id: string;
	name: string;
	/** Unit names the food can be measured in ('g' first). */
	units: string[];
}

/** The AI's answer for one row, already mapped back to a real candidate (or none). */
export interface RowMatch {
	index: number;
	food: MatchFood | null;
	/** Estimated weight of the amount as written, unchecked. */
	grams: number | null;
}

/** The row fields matching reads and writes (the recipe form's text values). */
export interface MatchableRow {
	amount: string;
	unit: string;
	foodId?: string;
	foodName?: string;
	grams?: string;
	gramsSource?: 'user' | 'ai';
	/** Display only: the food was linked by AI matching in this form. */
	foodMatch?: 'ai';
}

const validEstimate = (grams: number | null): grams is number =>
	grams !== null && Number.isFinite(grams) && grams > 0 && grams <= AI_GRAMS_MAX;

const roundGrams = (grams: number) => Math.round(grams * 10) / 10;

/**
 * Applies AI matches to form rows. A food is set only on rows with no food that the user has not
 * cleared. A weight estimate is kept only for a row with a food (new or existing), no weight of its
 * own, and an amount that does not convert with that food (or no amount at all). Rows the user
 * linked, cleared or weighed never change. `unitsOf` gives the units of foods rows already link.
 */
export const applyMatches = <R extends MatchableRow>(
	rows: R[],
	matches: RowMatch[],
	unitsOf: (foodId: string) => string[] | undefined,
	cleared: ReadonlySet<number> = new Set()
): R[] =>
	rows.map((row, index) => {
		const match = matches.find((m) => m.index === index);
		if (!match) return row;
		const next: R = { ...row };
		let units: string[] | undefined;
		if (row.foodId) {
			units = unitsOf(row.foodId);
		} else if (match.food && !cleared.has(index)) {
			next.foodId = match.food.id;
			next.foodName = match.food.name;
			next.foodMatch = 'ai';
			units = match.food.units;
		}
		if (!next.foodId || (row.grams ?? '').trim() !== '' || !validEstimate(match.grams)) return next;
		const quantity = parseAmount(row.amount);
		const converts =
			quantity !== null && quantity !== undefined && units !== undefined
				? unitConverts(row.unit.trim() || null, units)
				: false;
		if (!converts) {
			next.grams = String(roundGrams(match.grams));
			next.gramsSource = 'ai';
		}
		return next;
	});
