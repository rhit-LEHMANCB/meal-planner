import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { ANTHROPIC_API_KEY } from '$app/env/private';
import { parsedRecipeSchema, type ParsedRecipe } from './recipe-schema';

// Parsing is a cheap structured-extraction task. Move up a model tier only for messy photos.
const MODEL = 'claude-haiku-5-5';

const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

const SYSTEM = `You extract recipes into structured data.
Copy ingredient lines exactly into rawText. Do not invent amounts, times or steps.
Never estimate nutrition. Use null for anything the source does not state.`;

/** Turns recipe page text (or pasted text) into a validated recipe. Throws if the model output does not validate. */
export const extractRecipe = async (sourceText: string): Promise<ParsedRecipe> => {
	const response = await client.messages.create({
		model: MODEL,
		max_tokens: 4096,
		system: SYSTEM,
		tools: [
			{
				name: 'save_recipe',
				description: 'Save the structured recipe.',
				input_schema: z.toJSONSchema(parsedRecipeSchema) as Anthropic.Tool.InputSchema
			}
		],
		tool_choice: { type: 'tool', name: 'save_recipe' },
		messages: [{ role: 'user', content: sourceText }]
	});

	const toolUse = response.content.find((block) => block.type === 'tool_use');
	if (!toolUse) throw new Error('Model did not return a recipe.');
	return parsedRecipeSchema.parse(toolUse.input);
};
