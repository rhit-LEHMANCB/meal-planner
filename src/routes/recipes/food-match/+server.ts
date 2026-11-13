import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { applyMatches, type MatchableRow, type MatchFood } from '$lib/domain/food-match';
import { parseAmount } from '$lib/domain/ingredient-line';
import { unitConverts } from '$lib/domain/nutrition';
import { makeFoodMatcher, MATCH_ROWS_MAX, type MatchInputRow } from '$lib/server/ai/food-match';
import { requireUserId } from '$lib/server/auth';
import { getFoodStore } from '$lib/server/foods';
import { getImportUsage } from '$lib/server/import-usage';

const rowSchema = z.object({
	raw: z.string().max(300).catch(''),
	amount: z.string().max(40).catch(''),
	unit: z.string().max(40).catch(''),
	name: z.string().max(200).catch(''),
	foodId: z.string().max(64).catch(''),
	grams: z.string().max(40).catch(''),
	gramsSource: z.enum(['user', 'ai']).optional().catch(undefined),
	/** The user cleared this row's food in the form: never refill it. */
	cleared: z.boolean().catch(false)
});

const bodySchema = z.object({ rows: z.array(rowSchema).max(MATCH_ROWS_MAX) });

/**
 * "Match with AI" on the edit form: matches the form's current rows (not the saved recipe) and
 * returns the rows that changed. Under /recipes, not the public /api/*. Uses the same 10 s spacing
 * as imports and the daily matching cap. Saves nothing.
 */
export const POST = async ({ locals, request }) => {
	const userId = requireUserId(locals);
	const parsed = bodySchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) throw error(400, 'Bad request');
	const rows = parsed.data.rows;

	const foods = getFoodStore();
	// Only foods the user can see count as linked; the client's ids are not trusted.
	const linked = new Map(
		(
			await foods.getMany(
				userId,
				rows.flatMap((r) => (r.foodId ? [r.foodId] : []))
			)
		).map((f) => [f.id, f])
	);
	const needsWeight = (row: (typeof rows)[number], food: MatchFood) => {
		const quantity = parseAmount(row.amount);
		return (
			row.grams.trim() === '' &&
			(quantity === null ||
				quantity === undefined ||
				!unitConverts(row.unit.trim() || null, food.units))
		);
	};
	const input: MatchInputRow[] = rows.flatMap((row, index) => {
		const base = {
			index,
			line: row.raw || [row.amount, row.unit, row.name].filter(Boolean).join(' '),
			name: row.name,
			quantity: parseAmount(row.amount) ?? null,
			unit: row.unit.trim() || null
		};
		const food = row.foodId ? linked.get(row.foodId) : undefined;
		if (food) return needsWeight(row, food) ? [{ ...base, fixedFood: food }] : [];
		if (row.foodId || row.cleared) return [];
		return [base];
	});

	// Nothing to match: answer without using the 10 s spacing or a matching run.
	if (input.length === 0) return json({ status: 'none', rows: [] });
	const usage = getImportUsage();
	if (!(await usage.startImport(userId)))
		return json({ status: 'cooldown', rows: [] }, { status: 429 });

	const matcher = makeFoodMatcher({ foods, usage });
	const outcome = await matcher.match(userId, input);
	const cleared = new Set(rows.flatMap((r, i) => (r.cleared ? [i] : [])));
	const formRows: MatchableRow[] = rows.map((r) => ({
		amount: r.amount,
		unit: r.unit,
		foodId: r.foodId && linked.has(r.foodId) ? r.foodId : '',
		foodName: r.foodId ? (linked.get(r.foodId)?.name ?? '') : '',
		grams: r.grams,
		gramsSource: r.gramsSource
	}));
	const applied = applyMatches(formRows, outcome.matches, (id) => linked.get(id)?.units, cleared);

	const changedIds = applied.flatMap((r, i) =>
		r.foodId && r.foodId !== formRows[i].foodId ? [r.foodId] : []
	);
	const numbers = await foods.nutritionFor(userId, [...changedIds, ...linked.keys()]);
	const changed = applied.flatMap((r, index) => {
		const before = formRows[index];
		if (r.foodId === before.foodId && r.grams === before.grams) return [];
		const food = outcome.matches.find((m) => m.index === index)?.food;
		return [
			{
				index,
				foodId: r.foodId,
				foodName: r.foodName,
				foodMatch: r.foodMatch ?? null,
				units: (r.foodId === before.foodId ? linked.get(r.foodId ?? '')?.units : food?.units) ?? [
					'g'
				],
				nutrition: r.foodId ? (numbers.get(r.foodId) ?? null) : null,
				grams: r.grams,
				gramsSource: r.gramsSource ?? null
			}
		];
	});
	return json({ status: outcome.status, rows: changed });
};
