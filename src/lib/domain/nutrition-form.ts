// Parses the Nutrition page forms. Pure, with field errors keyed by input name.
import { z } from 'zod';
import type { NutritionGoals } from './nutrition';
import { isSlot, weekDays, type Slot } from './plan';
import { PLAN_LIMITS, type FormResult } from './plan-form';

export const GOAL_LIMITS = {
	kcal: { min: 500, max: 10000 },
	macro: { min: 0, max: 1000 }
} as const;

export const LOG_LIMITS = { servingsMax: 99 } as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const text = (data: FormData, key: string) => {
	const value = data.get(key);
	return typeof value === 'string' ? value.trim() : '';
};

const read = (data: FormData, keys: string[]) =>
	Object.fromEntries(keys.map((k) => [k, text(data, k)]));

const firstErrors = (issues: z.core.$ZodIssue[]) => {
	const errors: Record<string, string> = {};
	for (const issue of issues) errors[String(issue.path[0] ?? 'form')] ??= issue.message;
	return errors;
};

const whole = (min: number, max: number, message: string) =>
	z
		.string()
		.refine((v) => /^\d+$/.test(v) && Number(v) >= min && Number(v) <= max, message)
		.transform(Number);

const positive = (max: number, message: string) =>
	z
		.string()
		.refine((v) => /^\d+(\.\d+)?$/.test(v) && Number(v) > 0 && Number(v) <= max, message)
		.transform(Number);

const thousands = (n: number) => n.toLocaleString('en-US');

const grams = whole(
	GOAL_LIMITS.macro.min,
	GOAL_LIMITS.macro.max,
	`Enter whole grams from ${GOAL_LIMITS.macro.min} to ${thousands(GOAL_LIMITS.macro.max)}.`
);

export const parseGoalsForm = (data: FormData): FormResult<NutritionGoals> => {
	const r = z
		.object({
			kcal: whole(
				GOAL_LIMITS.kcal.min,
				GOAL_LIMITS.kcal.max,
				`Enter whole kcal from ${GOAL_LIMITS.kcal.min} to ${thousands(GOAL_LIMITS.kcal.max)}.`
			),
			proteinG: grams,
			carbsG: grams,
			fatG: grams
		})
		.safeParse(read(data, ['kcal', 'proteinG', 'carbsG', 'fatG']));
	return r.success
		? { ok: true, value: r.data }
		: { ok: false, errors: firstErrors(r.error.issues) };
};

interface LogTarget {
	date: string;
	slot: Slot | null;
}

export type LogInput =
	| (LogTarget & { kind: 'food'; foodId: string; amount: number; unit: string })
	| (LogTarget & { kind: 'recipe'; recipeId: string; servings: number });

const foodShape = z.object({
	foodId: z.string().regex(UUID, 'Choose a food.'),
	amount: positive(PLAN_LIMITS.amountMax, 'Enter an amount greater than 0.'),
	unit: z.string().min(1, 'Choose a unit.').max(PLAN_LIMITS.unitMax, 'Choose a unit.')
});

const recipeShape = z.object({
	recipeId: z.string().regex(UUID, 'Choose a recipe.'),
	servings: positive(
		LOG_LIMITS.servingsMax,
		`Enter servings greater than 0, up to ${LOG_LIMITS.servingsMax}.`
	)
});

/** A log entry for one day of the week starting `monday`, with an optional meal slot. */
export const parseLogForm = (data: FormData, monday: string): FormResult<LogInput> => {
	const days = weekDays(monday);
	const target = z
		.object({
			date: z.string().refine((d) => days.includes(d), 'Pick a day of this week.'),
			slot: z.string().refine((s) => s === '' || isSlot(s), 'Pick a meal.')
		})
		.safeParse(read(data, ['date', 'slot']));
	const errors: Record<string, string> = target.success ? {} : firstErrors(target.error.issues);
	const where = (t: { date: string; slot: string }): LogTarget => ({
		date: t.date,
		slot: t.slot === '' ? null : (t.slot as Slot)
	});

	const kind = text(data, 'kind');
	if (kind === 'food') {
		const r = foodShape.safeParse(read(data, ['foodId', 'amount', 'unit']));
		if (!r.success) Object.assign(errors, firstErrors(r.error.issues));
		if (!r.success || !target.success) return { ok: false, errors };
		return { ok: true, value: { kind, ...r.data, ...where(target.data) } };
	}
	if (kind === 'recipe') {
		const r = recipeShape.safeParse(read(data, ['recipeId', 'servings']));
		if (!r.success) Object.assign(errors, firstErrors(r.error.issues));
		if (!r.success || !target.success) return { ok: false, errors };
		return { ok: true, value: { kind, ...r.data, ...where(target.data) } };
	}
	return { ok: false, errors: { ...errors, kind: 'Choose food or recipe.' } };
};

/** The id of a log entry to delete, or null when it is not an id. */
export const parseLogId = (data: FormData): string | null => {
	const id = text(data, 'logId');
	return UUID.test(id) ? id : null;
};
