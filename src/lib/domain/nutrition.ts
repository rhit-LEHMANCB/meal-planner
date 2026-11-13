// Calorie and macro math. Pure: the numbers always come from foods (per 100 g) and gram weights,
// never from the AI model. Used by the recipe page, the plan's day totals and the Nutrition page.
import { normalizeUnit } from './ingredient-line';
import { toGrams } from './units';

export interface Macros {
	kcal: number;
	proteinG: number;
	carbsG: number;
	fatG: number;
}

export interface FoodPer100g {
	kcalPer100g: number;
	proteinPer100g: number;
	carbsPer100g: number;
	fatPer100g: number;
}

/** A food's numbers plus its units in grams per one unit ("cup" → 185). */
export interface FoodNutrition extends FoodPer100g {
	id: string;
	units: Record<string, number>;
}

export const ZERO_MACROS: Macros = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };

export const macrosForGrams = (food: FoodPer100g, grams: number): Macros => {
	const factor = grams / 100;
	return {
		kcal: food.kcalPer100g * factor,
		proteinG: food.proteinPer100g * factor,
		carbsG: food.carbsPer100g * factor,
		fatG: food.fatPer100g * factor
	};
};

export const sumMacros = (items: Macros[]): Macros =>
	items.reduce(
		(total, m) => ({
			kcal: total.kcal + m.kcal,
			proteinG: total.proteinG + m.proteinG,
			carbsG: total.carbsG + m.carbsG,
			fatG: total.fatG + m.fatG
		}),
		ZERO_MACROS
	);

export const scaleMacros = (m: Macros, factor: number): Macros => ({
	kcal: m.kcal * factor,
	proteinG: m.proteinG * factor,
	carbsG: m.carbsG * factor,
	fatG: m.fatG * factor
});

export const perServing = (total: Macros, servings: number): Macros =>
	scaleMacros(total, 1 / servings);

/** The canonical unit ("Tablespoons" → "tbsp"); unknown units keep their own spelling. */
const unitKey = (unit: string | null) => (unit === null ? null : (normalizeUnit(unit) ?? unit));

/**
 * An amount's weight: weight units, then the food's own units (no unit = its "each"). Null when
 * neither covers it.
 */
export const amountGrams = (
	quantity: number | null,
	unit: string | null,
	food: Pick<FoodNutrition, 'units'>
): number | null => (quantity === null ? null : toGrams(quantity, unitKey(unit), food.units));

/** Unit names a food can be measured in, as search results carry them (no grams). */
export const unitConverts = (unit: string | null, foodUnits: string[]): boolean =>
	amountGrams(1, unit, { units: Object.fromEntries(foodUnits.map((u) => [u, 1])) }) !== null;

export interface IngredientForNutrition {
	name: string | null;
	quantity: number | null;
	unit: string | null;
	foodId: string | null;
	/** Weight the user entered for a row whose amount does not convert. */
	grams: number | null;
}

/** A linked row's weight: its amount if it converts, else the grams entered on the row. */
export const ingredientGrams = (
	row: IngredientForNutrition,
	food: FoodNutrition | undefined
): number | null => {
	if (!food) return null;
	return amountGrams(row.quantity, row.unit, food) ?? row.grams;
};

export interface RecipeNutrition {
	perServing: Macros;
	/** Rows that count toward nutrition, out of `total` rows with a name. */
	counted: number;
	total: number;
	partial: boolean;
}

export const recipeNutrition = (
	rows: IngredientForNutrition[],
	foodsById: Map<string, FoodNutrition>,
	servings: number
): RecipeNutrition => {
	const named = rows.filter((r) => r.name !== null && r.name.trim() !== '');
	const parts: Macros[] = [];
	for (const row of named) {
		const food = row.foodId ? foodsById.get(row.foodId) : undefined;
		const grams = ingredientGrams(row, food);
		if (food && grams !== null) parts.push(macrosForGrams(food, grams));
	}
	return {
		perServing: servings > 0 ? perServing(sumMacros(parts), servings) : ZERO_MACROS,
		counted: parts.length,
		total: named.length,
		partial: parts.length < named.length || named.length === 0
	};
};

/** Whether a row counts toward its recipe's nutrition. */
export const rowCounts = (row: IngredientForNutrition, foodsById: Map<string, FoodNutrition>) =>
	ingredientGrams(row, row.foodId ? foodsById.get(row.foodId) : undefined) !== null;

export interface EntryForNutrition {
	date: string;
	kind: 'cook' | 'leftover' | 'food';
	recipeId: string | null;
	servings: number;
	foodId: string | null;
	amount: number | null;
	unit: string | null;
}

export type DayPart = 'planned' | 'leftover' | 'logged';

export interface EntryNutrition {
	macros: Macros;
	partial: boolean;
	part: DayPart;
}

/** A cook counts servings eaten, a leftover servings drawn, a food its weight. */
export const entryNutrition = (
	entry: EntryForNutrition,
	recipesById: Map<string, RecipeNutrition>,
	foodsById: Map<string, FoodNutrition>
): EntryNutrition => {
	if (entry.kind === 'food') {
		const food = entry.foodId ? foodsById.get(entry.foodId) : undefined;
		const grams = food ? amountGrams(entry.amount, entry.unit, food) : null;
		return food && grams !== null
			? { macros: macrosForGrams(food, grams), partial: false, part: 'planned' }
			: { macros: ZERO_MACROS, partial: true, part: 'planned' };
	}
	const part = entry.kind === 'leftover' ? 'leftover' : 'planned';
	const recipe = entry.recipeId ? recipesById.get(entry.recipeId) : undefined;
	if (!recipe) return { macros: ZERO_MACROS, partial: true, part };
	return { macros: scaleMacros(recipe.perServing, entry.servings), partial: recipe.partial, part };
};

export interface LoggedForNutrition {
	date: string;
	macros: Macros;
}

export interface DayNutrition {
	date: string;
	planned: Macros;
	leftover: Macros;
	logged: Macros;
	total: Macros;
	partial: boolean;
	/** True when anything is planned or logged that day. */
	hasEntries: boolean;
}

export const dayTotals = (
	days: string[],
	entries: { date: string; nutrition: EntryNutrition }[],
	logs: LoggedForNutrition[]
): DayNutrition[] =>
	days.map((date) => {
		const own = entries.filter((e) => e.date === date);
		const part = (p: DayPart) =>
			sumMacros(own.filter((e) => e.nutrition.part === p).map((e) => e.nutrition.macros));
		const planned = part('planned');
		const leftover = part('leftover');
		const logged = sumMacros(logs.filter((l) => l.date === date).map((l) => l.macros));
		return {
			date,
			planned,
			leftover,
			logged,
			total: sumMacros([planned, leftover, logged]),
			partial: own.some((e) => e.nutrition.partial),
			hasEntries: own.length > 0 || logs.some((l) => l.date === date)
		};
	});

/** Average per day over the days that have anything planned or logged; null if none do. */
export const weekAverage = (days: DayNutrition[]): Macros | null => {
	const active = days.filter((d) => d.hasEntries);
	return active.length === 0
		? null
		: scaleMacros(sumMacros(active.map((d) => d.total)), 1 / active.length);
};

export interface NutritionGoals {
	kcal: number;
	proteinG: number;
	carbsG: number;
	fatG: number;
}

export const DEFAULT_GOALS: NutritionGoals = { kcal: 2000, proteinG: 140, carbsG: 230, fatG: 70 };

export interface GoalProgress {
	value: number;
	goal: number;
	/** Whole units left before the goal, or over it (one of them is 0). */
	left: number;
	over: number;
	/** Share of the goal reached, 0 to 100, for a bar. */
	percent: number;
}

export const goalProgress = (value: number, goal: number): GoalProgress => {
	const v = Math.round(value);
	return {
		value: v,
		goal,
		left: Math.max(0, goal - v),
		over: Math.max(0, v - goal),
		percent: goal > 0 ? Math.min(100, Math.round((v / goal) * 100)) : 0
	};
};
