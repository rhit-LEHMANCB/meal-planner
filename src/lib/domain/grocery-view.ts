// Turns a week's grocery data into what the page shows: aisle sections of display-ready items.

import { aisleFor, groupByAisle, type Aisle, type AisleSection } from './aisles';
import {
	applyTicks,
	buildGroceryList,
	formatAmounts,
	nameKey,
	type GrocerySource
} from './grocery';

export interface ExtraRow {
	id: string;
	name: string;
	quantity: number | null;
	unit: string | null;
	checked: boolean;
}

export interface GroceryWeekData {
	sources: GrocerySource[];
	cooks: number;
	foods: number;
	ticks: ReadonlyMap<string, string>;
	extras: ExtraRow[];
	choices: ReadonlyMap<string, string>;
}

export interface ViewItem {
	/** Derived items: their key. Extra items: their row id. Unique within the list. */
	id: string;
	extra: boolean;
	/** Name key, for remembering the aisle. */
	key: string;
	name: string;
	amount: string;
	/** "Turkey chili, Fish tacos" or "Added by you". */
	forText: string;
	checked: boolean;
	moreNeeded: boolean;
	aisle: Aisle;
}

export interface GroceryView {
	sections: AisleSection<ViewItem>[];
	total: number;
	done: number;
	cooks: number;
	foods: number;
	/** Nothing planned that buys anything, and no extra items. */
	empty: boolean;
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export const buildGroceryView = (week: GroceryWeekData): GroceryView => {
	const derived: ViewItem[] = applyTicks(buildGroceryList(week.sources), week.ticks).map(
		(item) => ({
			id: item.key,
			extra: false,
			key: item.key,
			name: item.name,
			amount: formatAmounts(item),
			forText: item.forMeals.join(', '),
			checked: item.checked,
			moreNeeded: item.moreNeeded,
			aisle: aisleFor(item.name, item.key, item.foodAisle, week.choices)
		})
	);
	const extras: ViewItem[] = week.extras.map((row) => {
		const key = nameKey(row.name);
		return {
			id: row.id,
			extra: true,
			key,
			name: capitalize(row.name.trim()),
			amount:
				row.quantity === null
					? ''
					: formatAmounts({ amounts: [{ unit: row.unit, quantity: row.quantity }] }),
			forText: 'Added by you',
			checked: row.checked,
			moreNeeded: false,
			aisle: aisleFor(row.name, key, null, week.choices)
		};
	});
	const items = [...derived, ...extras];
	return {
		sections: groupByAisle(items),
		total: items.length,
		done: items.filter((i) => i.checked).length,
		cooks: week.cooks,
		foods: week.foods,
		empty: items.length === 0
	};
};
