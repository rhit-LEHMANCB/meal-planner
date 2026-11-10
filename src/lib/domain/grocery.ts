// Builds a week's grocery list from names and units. Pure: the store loads the sources, the
// route applies ticks and aisles. Leftovers never reach here (they were bought with their cook).

import { formatAmount, normalizeUnit, parseIngredientLine } from './ingredient-line';

export interface GroceryLine {
	name: string;
	quantity: number | null;
	unit: string | null;
	/** The aisle of the food this line comes from, when it has one. */
	aisle: string | null;
}

export interface GrocerySource {
	/** The meal shown as "for …": a recipe title, or a slot label for food entries. */
	meal: string;
	/** Multiplier for every line's quantity; null when the amounts cannot be scaled. */
	scale: number | null;
	lines: GroceryLine[];
}

export interface Amount {
	/** Normalized unit; null is a plain count ("3 onions"). */
	unit: string | null;
	quantity: number;
}

export interface GroceryItem {
	key: string;
	name: string;
	/** Amounts per unit, in the order the units were first seen. */
	amounts: Amount[];
	/** At least one use had no amount ("salt to taste"). */
	asNeeded: boolean;
	foodAisle: string | null;
	forMeals: string[];
}

const EPSILON = 1e-6;

/** Merge key for an item name: case and spacing ignored. */
export const nameKey = (name: string): string => name.trim().toLowerCase().replace(/\s+/g, ' ');

const unitKey = (unit: string | null): string | null => {
	const text = unit?.trim();
	if (!text) return null;
	return normalizeUnit(text) ?? text.toLowerCase();
};

const displayName = (name: string) => {
	const text = name.trim().replace(/\s+/g, ' ');
	return text.charAt(0).toUpperCase() + text.slice(1);
};

/** A stored recipe ingredient as a grocery line; rows saved before structured rows are parsed. */
export const ingredientLine = (row: {
	rawText: string;
	name: string | null;
	quantity: number | null;
	unit: string | null;
}): GroceryLine => {
	if (row.name === null) {
		const parsed = parseIngredientLine(row.rawText);
		return { name: parsed.name, quantity: parsed.quantity, unit: parsed.unit, aisle: null };
	}
	return { name: row.name, quantity: row.quantity, unit: row.unit, aisle: null };
};

export const buildGroceryList = (sources: GrocerySource[]): GroceryItem[] => {
	const items = new Map<string, GroceryItem>();

	for (const source of sources) {
		for (const line of source.lines) {
			const key = nameKey(line.name);
			if (!key) continue;

			let item = items.get(key);
			if (!item) {
				item = {
					key,
					name: displayName(line.name),
					amounts: [],
					asNeeded: false,
					foodAisle: null,
					forMeals: []
				};
				items.set(key, item);
			}
			item.foodAisle ??= line.aisle;
			if (!item.forMeals.includes(source.meal)) item.forMeals.push(source.meal);

			if (line.quantity === null || source.scale === null || !(line.quantity > 0)) {
				item.asNeeded = true;
				continue;
			}
			const unit = unitKey(line.unit);
			const quantity = line.quantity * source.scale;
			const existing = item.amounts.find((a) => a.unit === unit);
			if (existing) existing.quantity += quantity;
			else item.amounts.push({ unit, quantity });
		}
	}

	return [...items.values()];
};

/** Units that are bought whole, so their amounts round up. */
const COUNT_UNITS = new Set<string | null>([
	null,
	'each',
	'can',
	'jar',
	'clove',
	'bunch',
	'head',
	'piece',
	'slice',
	'stick',
	'sprig',
	'package'
]);

/** Count units are bought whole: the amount shown, ticked and compared is rounded up. */
const shown = ({ unit, quantity }: Amount) =>
	COUNT_UNITS.has(unit) ? Math.max(1, Math.ceil(quantity - EPSILON)) : quantity;

const formatOne = (amount: Amount) => {
	const text = COUNT_UNITS.has(amount.unit) ? String(shown(amount)) : formatAmount(amount.quantity);
	return amount.unit ? `${text} ${amount.unit}` : text;
};

/** "2 cup + 200 g", "3", or "as needed" when there is no amount at all. */
export const formatAmounts = (item: Pick<GroceryItem, 'amounts'>): string =>
	item.amounts.length ? item.amounts.map(formatOne).join(' + ') : 'as needed';

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Canonical text of an item's amounts, stored when it is ticked: "cup=2;g=200;-=3;?". */
export const serializeAmounts = (item: Pick<GroceryItem, 'amounts' | 'asNeeded'>): string => {
	const parts = item.amounts
		.map((a) => `${a.unit ?? '-'}=${round3(shown(a))}`)
		.sort((a, b) => a.localeCompare(b));
	if (item.asNeeded) parts.push('?');
	return parts.join(';');
};

const parseAmounts = (text: string) => {
	const units = new Map<string, number>();
	let asNeeded = false;
	for (const part of text.split(';')) {
		if (part === '?') asNeeded = true;
		const eq = part.lastIndexOf('=');
		if (eq > 0) units.set(part.slice(0, eq), Number(part.slice(eq + 1)));
	}
	return { units, asNeeded };
};

/** Whether what was ticked still covers what the item needs now (no unit needs more, none is new). */
export const isCovered = (
	ticked: string,
	current: Pick<GroceryItem, 'amounts' | 'asNeeded'>
): boolean => {
	const was = parseAmounts(ticked);
	if (current.asNeeded && !was.asNeeded) return false;
	return current.amounts.every((a) => {
		const had = was.units.get(a.unit ?? '-');
		return had !== undefined && had + EPSILON >= round3(shown(a));
	});
};

export interface TickedItem extends GroceryItem {
	checked: boolean;
	/** Ticked earlier, but more is needed now. */
	moreNeeded: boolean;
}

/** Marks items ticked when their stored tick still covers them. `ticks` maps item key to `ticked_amount`. */
export const applyTicks = (
	items: GroceryItem[],
	ticks: ReadonlyMap<string, string>
): TickedItem[] =>
	items.map((item) => {
		const ticked = ticks.get(item.key);
		if (ticked === undefined) return { ...item, checked: false, moreNeeded: false };
		const covered = isCovered(ticked, item);
		return { ...item, checked: covered, moreNeeded: !covered };
	});
