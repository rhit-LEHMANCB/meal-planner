import { z } from 'zod';
import {
	formatIngredientLine,
	parseIngredientLine,
	type ParsedLine
} from '$lib/domain/ingredient-line';
import type { ImportDraft } from '$lib/domain/recipe-import';

/**
 * What the model is asked to return for one imported recipe (the tool's input schema).
 * Nutrition is NOT here: numbers come from the foods table.
 */
export const parsedRecipeSchema = z.object({
	title: z.string().describe('The recipe title as written, or "" when the source has none.'),
	servings: z.number().int().positive().nullable().describe('Null when the source does not say.'),
	totalMinutes: z.number().int().positive().nullable(),
	ingredients: z.array(
		z.object({
			rawText: z.string().describe('The ingredient line exactly as written.'),
			quantity: z
				.number()
				.positive()
				.nullable()
				.describe('Null when no amount is given ("salt to taste").'),
			unit: z.string().nullable().describe('g, oz, lb, cup, tbsp, tsp, ml, each, can ... or null.'),
			name: z.string().describe('Plain ingredient name without prep notes, e.g. "yellow onion".'),
			note: z.string().nullable().describe('Prep note such as "diced" or "drained".')
		})
	),
	instructions: z.array(z.string())
});

export type ParsedRecipe = z.infer<typeof parsedRecipeSchema>;

const optionalText = z.string().trim().min(1).nullable().catch(null);

/** One ingredient as the model may actually return it: every field checked on its own. */
const lenientIngredient = z.object({
	rawText: z.string().trim().catch(''),
	quantity: z.number().positive().finite().nullable().catch(null),
	unit: optionalText,
	name: z.string().trim().catch(''),
	note: optionalText
});

const positiveInt = z.number().int().positive().nullable().catch(null);

export interface SalvagedRecipe {
	draft: ImportDraft;
	/** Ingredient and step rows that were unusable and left out. */
	droppedIngredients: number;
	droppedSteps: number;
}

/**
 * Keeps every usable part of the model's output instead of rejecting it whole: a missing
 * title or servings stays blank for the user, unusable rows are dropped and counted.
 */
export const salvageRecipe = (input: unknown, sourceUrl: string | null): SalvagedRecipe => {
	const obj = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;

	const ingredients: ParsedLine[] = [];
	let droppedIngredients = 0;
	for (const item of Array.isArray(obj.ingredients) ? obj.ingredients : []) {
		const parsed = lenientIngredient.safeParse(item);
		const row = parsed.success && item && typeof item === 'object' ? parsed.data : null;
		if (!row || (row.rawText === '' && row.name === '')) {
			droppedIngredients++;
			continue;
		}
		if (row.name === '') {
			ingredients.push(parseIngredientLine(row.rawText));
			continue;
		}
		const fields = { quantity: row.quantity, unit: row.unit, name: row.name, note: row.note };
		ingredients.push({ raw: row.rawText || formatIngredientLine(fields), ...fields });
	}

	const steps: string[] = [];
	let droppedSteps = 0;
	for (const step of Array.isArray(obj.instructions) ? obj.instructions : []) {
		if (typeof step === 'string' && step.trim() !== '') steps.push(step.trim());
		else droppedSteps++;
	}

	return {
		draft: {
			title: typeof obj.title === 'string' ? obj.title.trim() : '',
			servings: positiveInt.parse(obj.servings),
			totalMinutes: positiveInt.parse(obj.totalMinutes),
			sourceUrl,
			ingredients,
			steps
		},
		droppedIngredients,
		droppedSteps
	};
};
