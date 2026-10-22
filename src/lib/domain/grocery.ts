export interface PlannedIngredient {
	foodId: string;
	name: string;
	/** Amount for the whole recipe as written (all `recipeServings`). */
	grams: number;
	aisle: string | null;
}

export interface PlannedMeal {
	title: string;
	/** Servings being cooked or eaten for this planned meal. */
	servings: number;
	/** Servings the recipe's ingredient amounts make. */
	recipeServings: number;
	isLeftover: boolean;
	ingredients: PlannedIngredient[];
}

export interface GroceryItem {
	foodId: string;
	name: string;
	grams: number;
	aisle: string | null;
	forMeals: string[];
}

/**
 * Builds the grocery list for a week. Leftover meals add nothing (their ingredients were
 * bought when the batch was cooked), and staples already in the pantry are skipped.
 */
export const buildGroceryList = (
	meals: PlannedMeal[],
	stapleFoodIds: ReadonlySet<string> = new Set()
): GroceryItem[] => {
	const items = new Map<string, GroceryItem>();

	for (const meal of meals) {
		if (meal.isLeftover) continue;
		const scale = meal.servings / meal.recipeServings;

		for (const ing of meal.ingredients) {
			if (stapleFoodIds.has(ing.foodId)) continue;
			const existing = items.get(ing.foodId);
			if (existing) {
				existing.grams += ing.grams * scale;
				if (!existing.forMeals.includes(meal.title)) existing.forMeals.push(meal.title);
			} else {
				items.set(ing.foodId, {
					foodId: ing.foodId,
					name: ing.name,
					grams: ing.grams * scale,
					aisle: ing.aisle,
					forMeals: [meal.title]
				});
			}
		}
	}

	return [...items.values()].sort(
		(a, b) => (a.aisle ?? '~').localeCompare(b.aisle ?? '~') || a.name.localeCompare(b.name)
	);
};
