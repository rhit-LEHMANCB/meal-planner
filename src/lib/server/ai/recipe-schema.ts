import { z } from 'zod';

/** What the model returns for one imported recipe. Nutrition is NOT here: numbers come from the foods table. */
export const parsedRecipeSchema = z.object({
	title: z.string().min(1),
	servings: z.number().int().positive(),
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
