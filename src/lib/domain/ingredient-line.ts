// Splits ingredient lines ("1 can (15 oz) kidney beans, drained") into amount, unit, name and note.
// Pure and free of server imports: the ingredient row editor runs the same code in the browser.

export type IngredientStatus = 'parsed' | 'check' | 'skipped';

export interface IngredientFields {
	quantity: number | null;
	unit: string | null;
	name: string;
	note: string | null;
}

export interface ParsedLine extends IngredientFields {
	/** The line as written, trimmed. */
	raw: string;
}

export const STATUS_LABEL: Record<IngredientStatus, string> = {
	parsed: 'Parsed',
	check: 'Check',
	skipped: 'No amount'
};

const UNIT_ALIASES: Record<string, string[]> = {
	g: ['g', 'gr', 'gram', 'grams', 'gramme', 'grammes'],
	kg: ['kg', 'kgs', 'kilo', 'kilos', 'kilogram', 'kilograms'],
	mg: ['mg', 'milligram', 'milligrams'],
	oz: ['oz', 'ounce', 'ounces'],
	'fl oz': ['fl oz', 'fl. oz', 'fluid ounce', 'fluid ounces'],
	lb: ['lb', 'lbs', 'pound', 'pounds'],
	ml: ['ml', 'mls', 'milliliter', 'milliliters', 'millilitre', 'millilitres'],
	l: ['l', 'liter', 'liters', 'litre', 'litres'],
	cup: ['cup', 'cups', 'c'],
	tbsp: ['tbsp', 'tbsps', 'tbs', 'tbl', 'tablespoon', 'tablespoons'],
	tsp: ['tsp', 'tsps', 'teaspoon', 'teaspoons'],
	pint: ['pint', 'pints', 'pt'],
	quart: ['quart', 'quarts', 'qt'],
	gallon: ['gallon', 'gallons', 'gal'],
	pinch: ['pinch', 'pinches'],
	dash: ['dash', 'dashes'],
	clove: ['clove', 'cloves'],
	can: ['can', 'cans', 'tin', 'tins'],
	jar: ['jar', 'jars'],
	package: ['package', 'packages', 'pkg', 'packet', 'packets'],
	stick: ['stick', 'sticks'],
	slice: ['slice', 'slices'],
	piece: ['piece', 'pieces'],
	bunch: ['bunch', 'bunches'],
	sprig: ['sprig', 'sprigs'],
	head: ['head', 'heads'],
	each: ['each', 'ea']
};

const UNIT_LOOKUP = new Map<string, string>(
	Object.entries(UNIT_ALIASES).flatMap(([canonical, aliases]) =>
		aliases.map((alias) => [alias, canonical] as const)
	)
);

/**
 * The canonical unit for what the user wrote ("Tablespoons" → "tbsp"), or null if unknown.
 * A capital "T" is a tablespoon and a lower-case "t" a teaspoon, as on recipe cards.
 */
export const normalizeUnit = (unit: string): string | null => {
	const text = unit.trim().replace(/\.$/, '');
	if (text === 'T') return 'tbsp';
	if (text === 't') return 'tsp';
	return UNIT_LOOKUP.get(text.toLowerCase().replace(/\s+/g, ' ')) ?? null;
};

const UNICODE_FRACTIONS: Record<string, number> = {
	'½': 1 / 2,
	'⅓': 1 / 3,
	'⅔': 2 / 3,
	'¼': 1 / 4,
	'¾': 3 / 4,
	'⅕': 1 / 5,
	'⅛': 1 / 8,
	'⅜': 3 / 8,
	'⅝': 5 / 8,
	'⅞': 7 / 8
};
const FRACTION_CHARS = Object.keys(UNICODE_FRACTIONS).join('');

/** Matches one amount at the start of a string: "1 1/2", "1½", "1/2", "1.5", ".5", "2", "½". */
const AMOUNT = `(?:\\d+\\s+\\d+\\/\\d+|\\d+\\s*[${FRACTION_CHARS}]|\\d+\\/\\d+|\\d*\\.\\d+|\\d+|[${FRACTION_CHARS}])`;
const AMOUNT_RE = new RegExp(`^${AMOUNT}$`);
const LEADING_AMOUNT_RE = new RegExp(
	`^(${AMOUNT})(?:\\s*(?:-|–|to)\\s*(${AMOUNT}))?(?=\\s|$|[a-zA-Z(])`
);

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Reads an amount as typed: decimals, fractions and mixed numbers. Empty text is `null`
 * (no amount); text that is not an amount is `undefined`.
 */
export const parseAmount = (text: string): number | null | undefined => {
	const t = text.trim();
	if (t === '') return null;
	if (!AMOUNT_RE.test(t)) return undefined;

	let total = 0;
	for (const part of t.match(
		new RegExp(`\\d+\\/\\d+|\\d*\\.\\d+|\\d+|[${FRACTION_CHARS}]`, 'g')
	)!) {
		if (part in UNICODE_FRACTIONS) total += UNICODE_FRACTIONS[part];
		else if (part.includes('/')) {
			const [num, den] = part.split('/').map(Number);
			if (den === 0) return undefined;
			total += num / den;
		} else total += Number(part);
	}
	return round3(total);
};

const SKIP_RE = /\b(to taste|as needed|as required|optional|for serving|for garnish|to serve)\b/i;
const TRAILING_SKIP_RE =
	/[\s,]+(to taste|as needed|as required|optional|for serving|for garnish|to serve)\s*$/i;

/** Splits "kidney beans, drained" into name and note, and pulls a trailing "to taste" into the note. */
const splitNameNote = (text: string): { name: string; notes: string[] } => {
	let rest = text.trim();
	const notes: string[] = [];

	const comma = rest.indexOf(',');
	if (comma !== -1) {
		notes.push(rest.slice(comma + 1).trim());
		rest = rest.slice(0, comma).trim();
	}
	const skip = rest.match(TRAILING_SKIP_RE);
	if (skip && skip.index! > 0) {
		notes.unshift(skip[1]);
		rest = rest.slice(0, skip.index).trim();
	}
	return { name: rest, notes };
};

/** Splits one ingredient line into its parts. Never throws; an unreadable line becomes its own name. */
export const parseIngredientLine = (line: string): ParsedLine => {
	const raw = line.trim();
	let rest = raw.replace(/^[-*•·]\s*/, '');
	const notes: string[] = [];

	const takeParenthetical = () => {
		const paren = rest.match(/^\(([^)]*)\)\s*/);
		if (paren) {
			if (paren[1].trim()) notes.push(paren[1].trim());
			rest = rest.slice(paren[0].length);
		}
	};

	let quantity: number | null = null;
	let unit: string | null = null;

	const amount = rest.match(LEADING_AMOUNT_RE);
	if (amount) {
		quantity = parseAmount(amount[1]) ?? null;
		rest = rest.slice(amount[0].length).trim();
		takeParenthetical();

		// Two-word units first ("fl oz"), then one word.
		const two = rest.match(/^(\S+\s+\S+?)\.?(?=\s|$)/);
		const one = rest.match(/^([^\s,(]+?)\.?(?=[\s,(]|$)/);
		if (two && normalizeUnit(two[1])) {
			unit = normalizeUnit(two[1]);
			rest = rest.slice(two[0].length).trim();
		} else if (one && normalizeUnit(one[1])) {
			unit = normalizeUnit(one[1]);
			rest = rest.slice(one[0].length).trim();
		}
		takeParenthetical();
		rest = rest.replace(/^of\s+/i, '');
	}

	const { name, notes: more } = splitNameNote(rest);
	notes.push(...more);
	const note = notes.filter(Boolean).join(', ');

	return { raw, quantity, unit, name: name || (quantity === null ? raw : ''), note: note || null };
};

/** The row's chip: whether amount and unit were understood. Always computed, never stored by the client. */
export const ingredientStatus = (f: IngredientFields): IngredientStatus => {
	if (f.quantity === null) return SKIP_RE.test(`${f.name} ${f.note ?? ''}`) ? 'skipped' : 'check';
	if (!f.unit) return 'parsed';
	return normalizeUnit(f.unit) ? 'parsed' : 'check';
};

const NICE_FRACTIONS: [number, string][] = [
	[1 / 8, '1/8'],
	[1 / 4, '1/4'],
	[1 / 3, '1/3'],
	[3 / 8, '3/8'],
	[1 / 2, '1/2'],
	[5 / 8, '5/8'],
	[2 / 3, '2/3'],
	[3 / 4, '3/4'],
	[7 / 8, '7/8']
];

/** Shows an amount the way a recipe would: 1.5 → "1 1/2", 0.333 → "1/3", 2.25 → "2 1/4". */
export const formatAmount = (n: number): string => {
	const value = round3(n);
	const whole = Math.floor(value);
	if (value === whole) return String(whole);
	// Only a fraction that reads back as exactly the same stored amount, so editing never shifts it.
	const nice = NICE_FRACTIONS.find(([v]) => round3(whole + v) === value);
	if (nice) return whole > 0 ? `${whole} ${nice[1]}` : nice[1];
	return String(value);
};

/** Builds a display line from the parts: "2 tbsp chili powder, divided". */
export const formatIngredientLine = (f: IngredientFields): string => {
	const head = [f.quantity === null ? '' : formatAmount(f.quantity), f.unit ?? '', f.name]
		.filter((s) => s.trim() !== '')
		.join(' ');
	return f.note ? `${head}, ${f.note}` : head;
};
