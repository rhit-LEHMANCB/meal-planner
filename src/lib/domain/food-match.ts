// Turns ingredient names into food searches. Pure: used by food search and suggestions.

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
