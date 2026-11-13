// Pure mapping from the USDA FoodData Central SR Legacy CSV files to `foods` and `food_units`
// rows. Used only by `scripts/usda/build-seed.ts`, which writes the seed migration.
import { createHash } from 'node:crypto';
import { normalizeUnit } from './ingredient-line';

/** FoodData Central nutrient ids for the four numbers the app stores. */
export const NUTRIENT_IDS = {
	kcal: '1008',
	protein: '1003',
	carbs: '1005',
	fat: '1004'
} as const;

export interface UsdaFood {
	fdcId: string;
	name: string;
	kcal: number;
	protein: number;
	carbs: number;
	fat: number;
}

export interface UsdaPortion {
	fdcId: string;
	seq: number;
	amount: number;
	modifier: string;
	gramWeight: number;
}

export interface SeedUnit {
	unit: string;
	grams: number;
}

/** Splits one CSV line with double-quoted fields ("" is an escaped quote). */
export const parseCsvLine = (line: string): string[] => {
	const fields: string[] = [];
	let field = '';
	let quoted = false;
	for (let i = 0; i < line.length; i++) {
		const ch = line[i];
		if (quoted) {
			if (ch === '"' && line[i + 1] === '"') {
				field += '"';
				i++;
			} else if (ch === '"') quoted = false;
			else field += ch;
		} else if (ch === '"') quoted = true;
		else if (ch === ',') {
			fields.push(field);
			field = '';
		} else field += ch;
	}
	fields.push(field);
	return fields;
};

/** A stable uuid for a USDA food, so units can reference it and a re-run gives the same SQL. */
export const usdaFoodId = (fdcId: string): string => {
	const bytes = createHash('sha1').update(`usda:${fdcId}`).digest().subarray(0, 16);
	bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5 (name-based, SHA-1)
	bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
	const hex = bytes.toString('hex');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

/** Units that already convert by weight, and portions too vague to use. */
const SKIPPED_UNITS = new Set(['g', 'kg', 'mg', 'oz', 'lb', 'serving', 'nlea serving']);

/**
 * The unit name for a USDA portion modifier ("cup, chopped" → "cup", "tablespoon" → "tbsp",
 * "medium (2-3/4" dia)" → "medium"), or null when it is a weight, a serving or not a plain unit.
 */
export const portionUnit = (modifier: string): string | null => {
	const text = modifier.split(/[,(]/)[0].trim().toLowerCase().replace(/\s+/g, ' ');
	if (!text) return null;
	const firstWord = text.split(' ')[0];
	const unit =
		normalizeUnit(text) ??
		normalizeUnit(firstWord) ??
		(/^[a-z]+$/.test(text) && text.length <= 20 ? text : null);
	if (unit === null || SKIPPED_UNITS.has(unit) || SKIPPED_UNITS.has(text)) return null;
	return unit;
};

/** Portions that stand for one whole item when a food has no "each" of its own, best first. */
const EACH_SOURCES = ['medium', 'piece', 'unit', 'item', 'whole', 'fruit', 'large', 'small'];

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * A food's units from its portions: the first portion per unit by sequence number, grams per one
 * unit, plus "each" from the best whole-item portion when the food has none.
 */
export const unitsForPortions = (portions: UsdaPortion[]): SeedUnit[] => {
	const byUnit = new Map<string, number>();
	for (const p of [...portions].sort((a, b) => a.seq - b.seq)) {
		const unit = portionUnit(p.modifier);
		if (unit === null || byUnit.has(unit) || !(p.amount > 0) || !(p.gramWeight > 0)) continue;
		const grams = round2(p.gramWeight / p.amount);
		if (grams > 0) byUnit.set(unit, grams);
	}
	if (!byUnit.has('each')) {
		const source = EACH_SOURCES.find((u) => byUnit.has(u));
		if (source) byUnit.set('each', byUnit.get(source)!);
	}
	return [...byUnit]
		.map(([unit, grams]) => ({ unit, grams }))
		.sort((a, b) => a.unit.localeCompare(b.unit));
};

const sqlText = (s: string) => `'${s.replace(/'/g, "''")}'`;
const sqlNum = (n: number) => String(round2(n));

export const SEED_CHUNK = 500;

/** The migration body: chunked inserts of foods, then their units, each skipping existing rows. */
export const seedSql = (foods: UsdaFood[], units: Map<string, SeedUnit[]>): string => {
	const statements: string[] = [];
	const sorted = [...foods].sort((a, b) => Number(a.fdcId) - Number(b.fdcId));
	for (let i = 0; i < sorted.length; i += SEED_CHUNK) {
		const rows = sorted
			.slice(i, i + SEED_CHUNK)
			.map(
				(f) =>
					`(${sqlText(usdaFoodId(f.fdcId))}, NULL, ${sqlText(f.name)}, 'usda', ${sqlText(f.fdcId)}, ` +
					`${sqlNum(f.kcal)}, ${sqlNum(f.protein)}, ${sqlNum(f.carbs)}, ${sqlNum(f.fat)})`
			);
		statements.push(
			'INSERT INTO "foods" ("id", "user_id", "name", "source", "source_id", "kcal_per_100g", ' +
				'"protein_per_100g", "carbs_per_100g", "fat_per_100g") VALUES\n' +
				rows.join(',\n') +
				'\nON CONFLICT DO NOTHING;'
		);
	}
	const unitRows = sorted.flatMap((f) =>
		(units.get(f.fdcId) ?? []).map((u) => {
			const id = usdaFoodId(`${f.fdcId}:${u.unit}`);
			return `(${sqlText(id)}, ${sqlText(usdaFoodId(f.fdcId))}, ${sqlText(u.unit)}, ${sqlNum(u.grams)})`;
		})
	);
	for (let i = 0; i < unitRows.length; i += SEED_CHUNK) {
		statements.push(
			'INSERT INTO "food_units" ("id", "food_id", "unit", "grams") VALUES\n' +
				unitRows.slice(i, i + SEED_CHUNK).join(',\n') +
				'\nON CONFLICT DO NOTHING;'
		);
	}
	return statements.join('\n--> statement-breakpoint\n') + '\n';
};
