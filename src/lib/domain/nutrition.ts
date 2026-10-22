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

export const perServing = (total: Macros, servings: number): Macros => ({
	kcal: total.kcal / servings,
	proteinG: total.proteinG / servings,
	carbsG: total.carbsG / servings,
	fatG: total.fatG / servings
});
