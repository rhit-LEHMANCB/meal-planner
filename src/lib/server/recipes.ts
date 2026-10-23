import { and, asc, desc, eq, ilike, sql } from 'drizzle-orm';
import type { RecipeInput } from '$lib/domain/recipe-form';
import { getDb, type Db } from './db';
import { recipeIngredients, recipes } from './db/schema';

export interface RecipeSummary {
	id: string;
	title: string;
	servings: number;
	totalMinutes: number | null;
	sourceUrl: string | null;
	createdAt: Date;
	ingredientCount: number;
}

export interface Recipe {
	id: string;
	title: string;
	servings: number;
	totalMinutes: number | null;
	sourceUrl: string | null;
	instructions: string[];
	ingredients: string[];
	createdAt: Date;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Makes `%`, `_` and `\` in a search term match themselves instead of acting as LIKE wildcards. */
const escapeLike = (term: string) => term.replace(/[\\%_]/g, '\\$&');

/**
 * The only code that touches the recipe tables. Every method takes the owner's id and every
 * query filters by it, so one user can never read or change another user's recipes.
 * A recipe someone else owns looks exactly like one that does not exist.
 */
export const makeRecipeStore = (db: Db) => {
	const owned = (userId: string, id: string) => and(eq(recipes.id, id), eq(recipes.userId, userId));

	const ingredientRows = (recipeId: string, lines: string[]) =>
		lines.map((rawText, position) => ({
			recipeId,
			rawText,
			position,
			matchStatus: 'unparsed'
		}));

	return {
		/** The owner's recipes, newest first, optionally filtered by words in the title. */
		async list(userId: string, search?: string): Promise<RecipeSummary[]> {
			const term = search?.trim();
			return db
				.select({
					id: recipes.id,
					title: recipes.title,
					servings: recipes.servings,
					totalMinutes: recipes.totalMinutes,
					sourceUrl: recipes.sourceUrl,
					createdAt: recipes.createdAt,
					// Table names are written out: Drizzle prints a bare "id" in a single-table query, which
					// inside the subquery would mean the ingredient's own id.
					ingredientCount: sql<number>`(select count(*)::int from "recipe_ingredients" ri where ri."recipe_id" = "recipes"."id")`
				})
				.from(recipes)
				.where(
					and(
						eq(recipes.userId, userId),
						term ? ilike(recipes.title, `%${escapeLike(term)}%`) : undefined
					)
				)
				.orderBy(desc(recipes.createdAt));
		},

		async get(userId: string, id: string): Promise<Recipe | null> {
			if (!UUID.test(id)) return null;

			const [recipe] = await db.select().from(recipes).where(owned(userId, id)).limit(1);
			if (!recipe) return null;

			const ingredients = await db
				.select({ rawText: recipeIngredients.rawText })
				.from(recipeIngredients)
				.where(eq(recipeIngredients.recipeId, recipe.id))
				.orderBy(asc(recipeIngredients.position));

			return {
				id: recipe.id,
				title: recipe.title,
				servings: recipe.servings,
				totalMinutes: recipe.totalMinutes,
				sourceUrl: recipe.sourceUrl,
				instructions: recipe.instructions,
				ingredients: ingredients.map((i) => i.rawText),
				createdAt: recipe.createdAt
			};
		},

		/** Saves the recipe and its ingredient lines in one atomic batch. Returns the new id. */
		async create(userId: string, input: RecipeInput): Promise<string> {
			const id = crypto.randomUUID();
			const insertRecipe = db.insert(recipes).values({
				id,
				userId,
				title: input.title,
				servings: input.servings,
				totalMinutes: input.totalMinutes,
				sourceUrl: input.sourceUrl,
				instructions: input.steps
			});

			if (input.ingredients.length === 0) {
				await insertRecipe;
			} else {
				await db.batch([
					insertRecipe,
					db.insert(recipeIngredients).values(ingredientRows(id, input.ingredients))
				]);
			}
			return id;
		},

		/** Replaces the recipe's fields and ingredient lines atomically. False if the owner has no such recipe. */
		async update(userId: string, id: string, input: RecipeInput): Promise<boolean> {
			if (!UUID.test(id)) return false;

			// Ownership never changes, so checking first and then writing in one batch is safe.
			const [existing] = await db
				.select({ id: recipes.id })
				.from(recipes)
				.where(owned(userId, id))
				.limit(1);
			if (!existing) return false;

			const updateRecipe = db
				.update(recipes)
				.set({
					title: input.title,
					servings: input.servings,
					totalMinutes: input.totalMinutes,
					sourceUrl: input.sourceUrl,
					instructions: input.steps
				})
				.where(owned(userId, id));
			const deleteIngredients = db
				.delete(recipeIngredients)
				.where(eq(recipeIngredients.recipeId, id));

			if (input.ingredients.length === 0) {
				await db.batch([updateRecipe, deleteIngredients]);
			} else {
				await db.batch([
					updateRecipe,
					deleteIngredients,
					db.insert(recipeIngredients).values(ingredientRows(id, input.ingredients))
				]);
			}
			return true;
		},

		/** Deletes the recipe; its ingredient lines go with it. False if the owner has no such recipe. */
		async remove(userId: string, id: string): Promise<boolean> {
			if (!UUID.test(id)) return false;
			const deleted = await db
				.delete(recipes)
				.where(owned(userId, id))
				.returning({ id: recipes.id });
			return deleted.length > 0;
		}
	};
};

export type RecipeStore = ReturnType<typeof makeRecipeStore>;

export const getRecipeStore = (): RecipeStore => makeRecipeStore(getDb());
