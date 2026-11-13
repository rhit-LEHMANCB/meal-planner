import { z } from 'zod';
import {
	formatAmount,
	formatIngredientLine,
	ingredientStatus,
	parseAmount,
	parseIngredientLine,
	type IngredientFields,
	type IngredientStatus
} from './ingredient-line';

export const LIMITS = {
	titleMax: 200,
	sourceUrlMax: 2048,
	servingsMax: 99,
	totalMinutesMax: 1440,
	ingredientsMax: 100,
	ingredientLineMax: 300,
	amountMax: 99999,
	unitMax: 20,
	nameMax: 100,
	noteMax: 100,
	gramsMax: 100000,
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
		)
		.refine(
			(v) => v.length <= LIMITS.sourceUrlMax,
			`The link must be ${LIMITS.sourceUrlMax} characters or fewer.`
		),
	steps: lines('Steps', LIMITS.stepsMax, LIMITS.stepMax)
});

export type RecipeField =
	'title' | 'servings' | 'totalMinutes' | 'sourceUrl' | 'ingredients' | 'steps';
export type RowField = 'amount' | 'unit' | 'name' | 'note' | 'food' | 'grams';

/** One ingredient row exactly as typed. `raw` is the line as written; the editor clears it on edit. */
export interface IngredientRowValues {
	raw: string;
	amount: string;
	unit: string;
	name: string;
	note: string;
	/** Linked food id ('' = none) and its name for display; the server checks the id. */
	foodId?: string;
	foodName?: string;
	/** Weight in grams typed for a linked row whose amount does not convert ('' = none). */
	grams?: string;
}

/** The form's text exactly as typed, used to refill the form after an error. */
export interface RecipeFormValues {
	title: string;
	servings: string;
	totalMinutes: string;
	sourceUrl: string;
	ingredients: IngredientRowValues[];
	steps: string;
}

export type RowErrors = Partial<Record<RowField, string>>;

export interface RecipeFormErrors extends Partial<Record<RecipeField, string>> {
	/** Errors per ingredient row, by its index in `values.ingredients`. */
	rows?: Record<number, RowErrors>;
}

/** A validated ingredient row, ready to save. */
export interface IngredientInput extends IngredientFields {
	/** The display line: the line as written when untouched, else rebuilt from the fields. */
	rawText: string;
	status: IngredientStatus;
	foodId: string | null;
	grams: number | null;
}

/** A validated recipe, ready to save. */
export interface RecipeInput {
	title: string;
	servings: number;
	totalMinutes: number | null;
	sourceUrl: string | null;
	ingredients: IngredientInput[];
	steps: string[];
}

export type RecipeFormResult =
	| { ok: true; value: RecipeInput; values: RecipeFormValues }
	| { ok: false; errors: RecipeFormErrors; values: RecipeFormValues };

interface FormLike {
	get(name: string): unknown;
	getAll(name: string): unknown[];
}

const text = (data: FormLike, name: string) => {
	const value = data.get(name);
	return typeof value === 'string' ? value : '';
};

const texts = (data: FormLike, name: string) =>
	data.getAll(name).map((v) => (typeof v === 'string' ? v : ''));

export const emptyRow = (): IngredientRowValues => ({
	raw: '',
	amount: '',
	unit: '',
	name: '',
	note: '',
	foodId: '',
	foodName: '',
	grams: ''
});

const isBlankRow = (row: IngredientRowValues) =>
	[row.amount, row.unit, row.name, row.note].every((v) => v.trim() === '');

/** Turns a parsed line into editor text. */
export const lineToRow = (line: {
	raw: string;
	quantity: number | null;
	unit: string | null;
	name: string;
	note: string | null;
}): IngredientRowValues => ({
	raw: line.raw,
	amount: line.quantity === null ? '' : formatAmount(line.quantity),
	unit: line.unit ?? '',
	name: line.name,
	note: line.note ?? '',
	foodId: '',
	foodName: '',
	grams: ''
});

/** The chip for a row as currently typed. Unreadable amounts count as "check". */
export const rowStatus = (row: IngredientRowValues): IngredientStatus => {
	const quantity = parseAmount(row.amount);
	if (quantity === undefined) return 'check';
	return ingredientStatus({
		quantity,
		unit: row.unit.trim() || null,
		name: row.name.trim(),
		note: row.note.trim() || null
	});
};

const AMOUNT_ERROR = 'Use a number or a fraction such as 1/2.';

/** Shown on a row whose linked food is not one the user can see. */
export const FOOD_NOT_FOUND = 'That food was not found. Pick another one.';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const validateRow = (row: IngredientRowValues): { errors: RowErrors; value?: IngredientInput } => {
	const errors: RowErrors = {};
	const quantity = parseAmount(row.amount);
	if (
		quantity === undefined ||
		(quantity !== null && (quantity <= 0 || quantity > LIMITS.amountMax))
	) {
		errors.amount = AMOUNT_ERROR;
	}
	const unit = row.unit.trim();
	const name = row.name.trim();
	const note = row.note.trim();
	if (unit.length > LIMITS.unitMax) errors.unit = `Unit: ${LIMITS.unitMax} characters or fewer.`;
	if (name === '') errors.name = 'Add a name for this ingredient.';
	else if (name.length > LIMITS.nameMax)
		errors.name = `Name: ${LIMITS.nameMax} characters or fewer.`;
	if (note.length > LIMITS.noteMax) errors.note = `Note: ${LIMITS.noteMax} characters or fewer.`;
	const foodId = (row.foodId ?? '').trim();
	if (foodId !== '' && !UUID.test(foodId)) errors.food = FOOD_NOT_FOUND;
	const gramsText = (row.grams ?? '').trim();
	const grams = gramsText === '' ? null : Number(gramsText);
	if (
		gramsText !== '' &&
		(!/^\d+(\.\d+)?$/.test(gramsText) || grams === null || grams <= 0 || grams > LIMITS.gramsMax)
	) {
		errors.grams = `Weight must be more than 0 g, up to ${LIMITS.gramsMax.toLocaleString('en-US')} g.`;
	}
	if (Object.keys(errors).length > 0) return { errors };

	const fields: IngredientFields = {
		quantity: quantity ?? null,
		unit: unit || null,
		name,
		note: note || null
	};
	const raw = row.raw.trim();
	return {
		errors,
		value: {
			...fields,
			rawText:
				raw !== '' && raw.length <= LIMITS.ingredientLineMax ? raw : formatIngredientLine(fields),
			status: ingredientStatus(fields),
			foodId: foodId || null,
			grams: foodId ? grams : null
		}
	};
};

/**
 * Validates the recipe form (a `FormData`). Ingredient rows arrive as parallel lists
 * (`ingredientRaw`, `ingredientAmount`, `ingredientUnit`, `ingredientName`, `ingredientNote`);
 * lines in `pastedLines` are split by the line parser and added after them. Row status is
 * always computed here, never taken from the browser.
 */
export const parseRecipeForm = (data: FormLike): RecipeFormResult => {
	const raws = texts(data, 'ingredientRaw');
	const amounts = texts(data, 'ingredientAmount');
	const units = texts(data, 'ingredientUnit');
	const names = texts(data, 'ingredientName');
	const notes = texts(data, 'ingredientNote');
	const foodIds = texts(data, 'ingredientFoodId');
	const foodNames = texts(data, 'ingredientFoodName');
	const gramsList = texts(data, 'ingredientGrams');
	const count = Math.max(raws.length, amounts.length, units.length, names.length, notes.length);

	const typed: IngredientRowValues[] = Array.from({ length: count }, (_, i) => ({
		raw: raws[i] ?? '',
		amount: amounts[i] ?? '',
		unit: units[i] ?? '',
		name: names[i] ?? '',
		note: notes[i] ?? '',
		foodId: foodIds[i] ?? '',
		foodName: foodNames[i] ?? '',
		grams: gramsList[i] ?? ''
	}));
	const pasted = parseLines(text(data, 'pastedLines')).map((line) =>
		lineToRow(parseIngredientLine(line))
	);
	const rows = [...typed, ...pasted].filter((row) => !isBlankRow(row));

	const values: RecipeFormValues = {
		title: text(data, 'title'),
		servings: text(data, 'servings'),
		totalMinutes: text(data, 'totalMinutes'),
		sourceUrl: text(data, 'sourceUrl'),
		ingredients: rows,
		steps: text(data, 'steps')
	};

	const errors: RecipeFormErrors = {};
	const parsed = schema.safeParse(values);
	if (!parsed.success) {
		for (const issue of parsed.error.issues) {
			const field = issue.path[0] as RecipeField;
			errors[field] ??= issue.message;
		}
	}

	if (rows.length > LIMITS.ingredientsMax) {
		errors.ingredients = `A recipe can have at most ${LIMITS.ingredientsMax} ingredients.`;
	}
	const ingredients: IngredientInput[] = [];
	rows.forEach((row, i) => {
		const result = validateRow(row);
		if (result.value) ingredients.push(result.value);
		else (errors.rows ??= {})[i] = result.errors;
	});
	if (errors.rows && !errors.ingredients) errors.ingredients = 'Fix the highlighted ingredients.';

	if (!parsed.success || Object.keys(errors).length > 0) return { ok: false, errors, values };

	const v = parsed.data;
	return {
		ok: true,
		values,
		value: {
			title: v.title,
			servings: Number(v.servings),
			totalMinutes: v.totalMinutes === '' ? null : Number(v.totalMinutes),
			sourceUrl: v.sourceUrl === '' ? null : v.sourceUrl,
			ingredients,
			steps: parseLines(v.steps)
		}
	};
};

/** A saved ingredient row. `unparsed` rows were saved as plain text before structured rows existed. */
export interface StoredIngredient {
	rawText: string;
	quantity: number | null;
	unit: string | null;
	name: string | null;
	note: string | null;
	status: IngredientStatus | 'unparsed';
	foodId?: string | null;
	/** The linked food's name, when the user can still see it. */
	foodName?: string | null;
	grams?: number | null;
}

/** Editor text for a saved row. Plain-text rows are pre-filled by the line parser; nothing is saved. */
export const storedToRow = (ingredient: StoredIngredient): IngredientRowValues => {
	const link = {
		foodId: ingredient.foodId && ingredient.foodName ? ingredient.foodId : '',
		foodName: ingredient.foodId && ingredient.foodName ? ingredient.foodName : '',
		grams: ingredient.grams == null ? '' : String(ingredient.grams)
	};
	return ingredient.status === 'unparsed' || ingredient.name === null
		? { ...lineToRow(parseIngredientLine(ingredient.rawText)), ...link }
		: {
				raw: ingredient.rawText,
				amount: ingredient.quantity === null ? '' : formatAmount(ingredient.quantity),
				unit: ingredient.unit ?? '',
				name: ingredient.name,
				note: ingredient.note ?? '',
				...link
			};
};

/** Turns a saved recipe back into form values for the edit page. */
export const recipeToFormValues = (recipe: {
	title: string;
	servings: number;
	totalMinutes: number | null;
	sourceUrl: string | null;
	ingredients: StoredIngredient[];
	instructions: string[];
}): RecipeFormValues => ({
	title: recipe.title,
	servings: String(recipe.servings),
	totalMinutes: recipe.totalMinutes === null ? '' : String(recipe.totalMinutes),
	sourceUrl: recipe.sourceUrl ?? '',
	ingredients: recipe.ingredients.map(storedToRow),
	steps: recipe.instructions.join('\n')
});

export const EMPTY_FORM: RecipeFormValues = {
	title: '',
	servings: '',
	totalMinutes: '',
	sourceUrl: '',
	ingredients: [],
	steps: ''
};
