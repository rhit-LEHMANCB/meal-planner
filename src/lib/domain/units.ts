const WEIGHT_UNITS_IN_GRAMS: Record<string, number> = {
	g: 1,
	kg: 1000,
	oz: 28.3495,
	lb: 453.592
};

const normalize = (unit: string) => unit.trim().toLowerCase().replace(/\.$/, '');

/**
 * Converts a quantity to grams. Weight units convert directly; volume and count units
 * (cup, tbsp, each) need a per-food conversion from `foodUnits`.
 * Returns null when the unit is unknown for this food, so callers can flag it for review.
 */
export const toGrams = (
	quantity: number,
	unit: string | null,
	foodUnits: Record<string, number> = {}
): number | null => {
	const key = unit ? normalize(unit) : 'each';
	const perUnit = WEIGHT_UNITS_IN_GRAMS[key] ?? foodUnits[key];
	return perUnit === undefined ? null : quantity * perUnit;
};
