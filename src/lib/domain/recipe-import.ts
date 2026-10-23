import { formatAmount, type ParsedLine } from './ingredient-line';
import type { RecipeFormValues } from './recipe-form';

/** What an import hands to the review screen. Nothing here is saved until the user confirms. */
export interface ImportDraft {
	title: string;
	/** Null when the source did not say; the user must fill it in. Never guessed. */
	servings: number | null;
	totalMinutes: number | null;
	sourceUrl: string | null;
	ingredients: ParsedLine[];
	steps: string[];
}

/** The review form's starting values for a draft. */
export const draftToFormValues = (draft: ImportDraft): RecipeFormValues => ({
	title: draft.title,
	servings: draft.servings === null ? '' : String(draft.servings),
	totalMinutes: draft.totalMinutes === null ? '' : String(draft.totalMinutes),
	sourceUrl: draft.sourceUrl ?? '',
	ingredients: draft.ingredients.map((line) => ({
		raw: line.raw,
		amount: line.quantity === null ? '' : formatAmount(line.quantity),
		unit: line.unit ?? '',
		name: line.name,
		note: line.note ?? ''
	})),
	steps: draft.steps.join('\n')
});

/** True when a draft has nothing worth reviewing. */
export const isEmptyDraft = (draft: ImportDraft): boolean =>
	draft.title.trim() === '' && draft.ingredients.length === 0 && draft.steps.length === 0;
