import { z } from 'zod';
import { isAisle, type Aisle } from './aisles';
import { parseIngredientLine } from './ingredient-line';

export const GROCERY_LIMITS = {
	extraTextMax: 200,
	extrasPerWeek: 100,
	keyMax: 200,
	amountMax: 99999
} as const;

export type FormResult<T> = { ok: true; value: T } | { ok: false; errors: Record<string, string> };

export interface TickInput {
	key: string;
	checked: boolean;
}

export interface ExtraInput {
	name: string;
	quantity: number | null;
	unit: string | null;
}

export interface ExtraTickInput {
	id: string;
	checked: boolean;
}

export interface AisleInput {
	key: string;
	aisle: Aisle;
}

const text = (data: FormData, key: string) => {
	const value = data.get(key);
	return typeof value === 'string' ? value.trim() : '';
};

const firstErrors = (issues: z.core.$ZodIssue[]) => {
	const errors: Record<string, string> = {};
	for (const issue of issues) {
		const key = String(issue.path[0] ?? 'form');
		errors[key] ??= issue.message;
	}
	return errors;
};

const key = z.string().min(1, 'Pick an item.').max(GROCERY_LIMITS.keyMax, 'Pick an item.');
const checked = z.enum(['true', 'false'], 'Pick ticked or not.').transform((v) => v === 'true');
const id = z.uuid('Pick an item.');

const parse = <T>(schema: z.ZodType<T>, data: FormData, keys: string[]): FormResult<T> => {
	const result = schema.safeParse(Object.fromEntries(keys.map((k) => [k, text(data, k)])));
	return result.success
		? { ok: true, value: result.data }
		: { ok: false, errors: firstErrors(result.error.issues) };
};

export const parseTickForm = (data: FormData): FormResult<TickInput> =>
	parse(z.object({ key, checked }), data, ['key', 'checked']);

export const parseExtraTickForm = (data: FormData): FormResult<ExtraTickInput> =>
	parse(z.object({ id, checked }), data, ['id', 'checked']);

export const parseRemoveForm = (data: FormData): FormResult<{ id: string }> =>
	parse(z.object({ id }), data, ['id']);

export const parseAisleForm = (data: FormData): FormResult<AisleInput> =>
	parse(
		z.object({
			key,
			aisle: z.string().refine(isAisle, 'Pick an aisle from the list.')
		}) as z.ZodType<AisleInput>,
		data,
		['key', 'aisle']
	);

/** "2 paper towels" → 2 × "paper towels"; the amount and unit are optional. */
export const parseExtraForm = (data: FormData): FormResult<ExtraInput> => {
	const raw = text(data, 'text');
	if (!raw) return { ok: false, errors: { text: 'Enter an item to add.' } };
	if (raw.length > GROCERY_LIMITS.extraTextMax) {
		return {
			ok: false,
			errors: { text: `Keep it to ${GROCERY_LIMITS.extraTextMax} characters or fewer.` }
		};
	}
	const parsed = parseIngredientLine(raw);
	const name = parsed.name.trim();
	if (!name) return { ok: false, errors: { text: 'Enter what to buy, not just an amount.' } };
	const quantity =
		parsed.quantity !== null && parsed.quantity > 0 && parsed.quantity <= GROCERY_LIMITS.amountMax
			? parsed.quantity
			: null;
	return { ok: true, value: { name, quantity, unit: quantity === null ? null : parsed.unit } };
};
