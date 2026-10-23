import { z } from 'zod';
import { isIsoDate, isSlot, type Slot } from './plan';

export const PLAN_LIMITS = {
	servingsMax: 99,
	amountMax: 99999,
	unitMax: 20,
	foodNameMax: 120,
	kcalMax: 900,
	macroMax: 100
} as const;

export type FormResult<T> = { ok: true; value: T } | { ok: false; errors: Record<string, string> };

export interface SlotTarget {
	date: string;
	slot: Slot;
}

export interface CookInput extends SlotTarget {
	recipeId: string;
	cooked: number;
	eaten: number;
}

export interface LeftoverInput extends SlotTarget {
	batchId: string;
	servings: number;
}

export interface NewFoodInput {
	name: string;
	kcalPer100g: number;
	proteinPer100g: number;
	carbsPer100g: number;
	fatPer100g: number;
}

export interface FoodEntryInput extends SlotTarget {
	/** An existing food, or null when `newFood` is to be created first. */
	foodId: string | null;
	newFood: NewFoodInput | null;
	amount: number;
	unit: string;
}

export type EntryUpdate =
	| { kind: 'cook'; cooked: number; eaten: number }
	| { kind: 'leftover'; servings: number }
	| { kind: 'food'; amount: number; unit: string };

const text = (data: FormData, key: string) => {
	const value = data.get(key);
	return typeof value === 'string' ? value.trim() : '';
};

const whole = (min: number, max: number, message: string) =>
	z
		.string()
		.trim()
		.refine((v) => /^\d+$/.test(v) && Number(v) >= min && Number(v) <= max, message)
		.transform(Number);

const decimal = (min: number, max: number, message: string, exclusiveMin = false) =>
	z
		.string()
		.trim()
		.refine((v) => {
			if (!/^\d+(\.\d+)?$/.test(v)) return false;
			const n = Number(v);
			return (exclusiveMin ? n > min : n >= min) && n <= max;
		}, message)
		.transform(Number);

const servings = whole(
	1,
	PLAN_LIMITS.servingsMax,
	`Enter a whole number from 1 to ${PLAN_LIMITS.servingsMax}.`
);
const amount = decimal(0, PLAN_LIMITS.amountMax, 'Enter an amount greater than 0.', true);
const unit = z.string().trim().min(1, 'Choose a unit.').max(PLAN_LIMITS.unitMax, 'Choose a unit.');
const id = z.string().trim().min(1, 'Choose one.');

const target = {
	date: z.string().refine(isIsoDate, 'Pick a day.'),
	slot: z.string().refine(isSlot, 'Pick a meal.')
};

const firstErrors = (issues: z.core.$ZodIssue[]) => {
	const errors: Record<string, string> = {};
	for (const issue of issues) {
		const key = String(issue.path[0] ?? 'form');
		errors[key] ??= issue.message;
	}
	return errors;
};

const read = (data: FormData, keys: string[]) =>
	Object.fromEntries(keys.map((k) => [k, text(data, k)]));

const cookShape = z
	.object({ cooked: servings, eaten: servings })
	.refine((v) => v.eaten <= v.cooked, {
		path: ['eaten'],
		message: 'You can’t eat more servings than you cook.'
	});

export const parseCookForm = (data: FormData): FormResult<CookInput> => {
	const result = z
		.object({ ...target, recipeId: id })
		.and(cookShape)
		.safeParse(read(data, ['date', 'slot', 'recipeId', 'cooked', 'eaten']));
	if (!result.success) return { ok: false, errors: firstErrors(result.error.issues) };
	return { ok: true, value: { ...result.data, slot: result.data.slot as Slot } };
};

export const parseLeftoverForm = (data: FormData): FormResult<LeftoverInput> => {
	const result = z
		.object({ ...target, batchId: id, servings })
		.safeParse(read(data, ['date', 'slot', 'batchId', 'servings']));
	if (!result.success) return { ok: false, errors: firstErrors(result.error.issues) };
	return { ok: true, value: { ...result.data, slot: result.data.slot as Slot } };
};

const newFoodShape = z.object({
	newFoodName: z
		.string()
		.trim()
		.min(1, 'Name is required.')
		.max(PLAN_LIMITS.foodNameMax, `Name must be ${PLAN_LIMITS.foodNameMax} characters or fewer.`),
	kcal: decimal(0, PLAN_LIMITS.kcalMax, `Enter kcal from 0 to ${PLAN_LIMITS.kcalMax}.`),
	protein: decimal(0, PLAN_LIMITS.macroMax, `Enter grams from 0 to ${PLAN_LIMITS.macroMax}.`),
	carbs: decimal(0, PLAN_LIMITS.macroMax, `Enter grams from 0 to ${PLAN_LIMITS.macroMax}.`),
	fat: decimal(0, PLAN_LIMITS.macroMax, `Enter grams from 0 to ${PLAN_LIMITS.macroMax}.`)
});

/** A food entry. With `create=1` the food is new and its name and per-100 g numbers are required. */
export const parseFoodForm = (data: FormData): FormResult<FoodEntryInput> => {
	const creating = text(data, 'create') === '1';
	const base = z
		.object({ ...target, amount, unit })
		.safeParse(read(data, ['date', 'slot', 'amount', 'unit']));
	const errors = base.success ? {} : firstErrors(base.error.issues);

	let foodId: string | null = null;
	let newFood: NewFoodInput | null = null;
	if (creating) {
		const food = newFoodShape.safeParse(
			read(data, ['newFoodName', 'kcal', 'protein', 'carbs', 'fat'])
		);
		if (food.success) {
			newFood = {
				name: food.data.newFoodName,
				kcalPer100g: food.data.kcal,
				proteinPer100g: food.data.protein,
				carbsPer100g: food.data.carbs,
				fatPer100g: food.data.fat
			};
		} else Object.assign(errors, firstErrors(food.error.issues));
	} else {
		foodId = text(data, 'foodId');
		if (!foodId) errors.foodId = 'Choose a food.';
	}

	if (!base.success || Object.keys(errors).length > 0) return { ok: false, errors };
	return {
		ok: true,
		value: { ...base.data, slot: base.data.slot as Slot, foodId, newFood }
	};
};

/** The fields an existing entry can change, depending on its kind. */
export const parseEntryUpdate = (
	data: FormData
): FormResult<{ entryId: string; update: EntryUpdate }> => {
	const entryId = text(data, 'entryId');
	if (!entryId) return { ok: false, errors: { form: 'That entry no longer exists.' } };
	const kind = text(data, 'kind');

	if (kind === 'cook') {
		const r = cookShape.safeParse(read(data, ['cooked', 'eaten']));
		return r.success
			? { ok: true, value: { entryId, update: { kind, ...r.data } } }
			: { ok: false, errors: firstErrors(r.error.issues) };
	}
	if (kind === 'leftover') {
		const r = z.object({ servings }).safeParse(read(data, ['servings']));
		return r.success
			? { ok: true, value: { entryId, update: { kind, servings: r.data.servings } } }
			: { ok: false, errors: firstErrors(r.error.issues) };
	}
	if (kind === 'food') {
		const r = z.object({ amount, unit }).safeParse(read(data, ['amount', 'unit']));
		return r.success
			? { ok: true, value: { entryId, update: { kind, ...r.data } } }
			: { ok: false, errors: firstErrors(r.error.issues) };
	}
	return { ok: false, errors: { form: 'That entry no longer exists.' } };
};
