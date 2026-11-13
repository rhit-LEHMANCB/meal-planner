<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { SUGGEST_MAX } from '$lib/domain/food-match';
	import {
		parseAmount,
		parseIngredientLine,
		STATUS_LABEL,
		type IngredientStatus
	} from '$lib/domain/ingredient-line';
	import { formatGrams, formatKcal } from '$lib/domain/format';
	import {
		recipeNutrition,
		unitConverts,
		type FoodNutrition,
		type IngredientForNutrition
	} from '$lib/domain/nutrition';
	import {
		emptyRow,
		lineToRow,
		parseLines,
		rowStatus,
		type IngredientRowValues,
		type RowErrors
	} from '$lib/domain/recipe-form';

	/** A food as food search returns it, with its numbers when the server sends them. */
	interface FoodOption {
		id: string;
		name: string;
		own: boolean;
		units: string[];
		nutrition?: FoodNutrition | null;
	}

	/** One changed row from "Match with AI". */
	interface MatchedRow {
		index: number;
		foodId: string;
		foodName: string;
		foodMatch: 'ai' | null;
		units: string[];
		nutrition: FoodNutrition | null;
		grams: string;
		gramsSource: 'user' | 'ai' | null;
	}

	let {
		rows,
		errors = {},
		error,
		nutrition = false,
		foodUnits = {},
		foodNutrition = {},
		preview = false,
		servings = '',
		aiMatch = false
	}: {
		/** Starting rows. Re-mount the component (with `{#key}`) to start over from new rows. */
		rows: IngredientRowValues[];
		/** Errors by index in `rows`. */
		errors?: Record<number, RowErrors>;
		/** A message about the ingredient list as a whole. */
		error?: string;
		/** Show food links, suggestions and grams (add and edit forms; not import review). */
		nutrition?: boolean;
		/** Units of the foods the starting rows link to, by food id. */
		foodUnits?: Record<string, string[]>;
		/** Numbers of the foods the starting rows link to, by food id (for the preview). */
		foodNutrition?: Record<string, FoodNutrition>;
		/** Show a per-serving nutrition preview that follows the rows (import review). */
		preview?: boolean;
		/** The form's servings field as typed, for the preview. */
		servings?: string;
		/** Offer "Match with AI" (edit form). */
		aiMatch?: boolean;
	} = $props();

	interface Item extends IngredientRowValues {
		id: number;
		errors: RowErrors;
		foodId: string;
		foodName: string;
		grams: string;
		/** Units of the linked food; null while unknown. */
		units: string[] | null;
		suggestion: FoodOption | null;
		/** The user linked, cleared or dismissed: no more suggestions for this row. */
		settled: boolean;
		/** The user cleared the food: AI matching never refills it. */
		cleared: boolean;
		/** The linked food's numbers, for the preview; null while unknown. */
		food: FoodNutrition | null;
		searchOpen: boolean;
		query: string;
		results: FoodOption[] | null;
	}

	let nextId = 0;
	const item = (row: IngredientRowValues, rowErrors: RowErrors = {}): Item => ({
		id: nextId++,
		...row,
		errors: rowErrors,
		foodId: row.foodId ?? '',
		foodName: row.foodName ?? '',
		grams: row.grams ?? '',
		units: row.foodId
			? (foodUnits[row.foodId] ??
				(foodNutrition[row.foodId] ? ['g', ...Object.keys(foodNutrition[row.foodId].units)] : null))
			: null,
		food: row.foodId ? (foodNutrition[row.foodId] ?? null) : null,
		suggestion: null,
		settled: Boolean(row.foodId),
		cleared: false,
		searchOpen: false,
		query: '',
		results: null
	});

	// Without scripting the form can only post the rows it rendered, so there are spare empty
	// rows to type into; the "Paste ingredient lines" box covers adding more.
	const initial = () => {
		const items = rows.map((row, i) => item(row, errors[i]));
		const spare = rows.length === 0 ? 3 : 1;
		for (let i = 0; i < spare; i++) items.push(item(emptyRow()));
		return items;
	};

	let items: Item[] = $state(initial());
	let pasted = $state('');

	const isBlank = (row: Item) =>
		[row.amount, row.unit, row.name, row.note].every((v) => v.trim() === '');

	/** The line as written no longer describes a row once its fields change. */
	const edited = (row: Item) => {
		row.raw = '';
		row.errors = {};
	};

	const move = (index: number, by: -1 | 1) => {
		const target = index + by;
		if (target < 0 || target >= items.length) return;
		[items[index], items[target]] = [items[target], items[index]];
	};

	const remove = (index: number) => {
		items.splice(index, 1);
		if (items.length === 0) items.push(item(emptyRow()));
	};

	const addRow = () => items.push(item(emptyRow()));

	const addLines = () => {
		const added = parseLines(pasted).map((line) => item(lineToRow(parseIngredientLine(line))));
		if (added.length === 0) return;
		// New rows replace trailing empty ones, so they follow the last real row.
		while (items.length > 0 && isBlank(items[items.length - 1])) items.pop();
		items.push(...added, item(emptyRow()));
		pasted = '';
		void suggest(items.filter((r) => added.some((a) => a.id === r.id)));
	};

	/** A linked row needs a weight when its amount does not convert with the food's units. */
	const needsGrams = (row: Item) => {
		if (!row.foodId) return false;
		const quantity = parseAmount(row.amount);
		if (quantity === null || quantity === undefined || row.units === null) return true;
		return !unitConverts(row.unit.trim() || null, row.units);
	};

	/** Suggests a food for unlinked rows with a name, and fills in the units of linked rows. */
	const suggest = async (targets: Item[]) => {
		if (!nutrition) return;
		const open = targets
			.filter((r) => !r.foodId && !r.settled && r.name.trim() !== '')
			.slice(0, SUGGEST_MAX);
		const linked = targets.filter((r) => r.foodId && r.units === null).slice(0, SUGGEST_MAX);
		if (open.length === 0 && linked.length === 0) return;
		const params = [
			...open.map((r) => `name=${encodeURIComponent(r.name.trim())}`),
			...linked.map((r) => `id=${encodeURIComponent(r.foodId)}`)
		].join('&');
		try {
			const response = await fetch(`${resolve('/recipes/food-suggestions')}?${params}`);
			if (!response.ok) return;
			const result = (await response.json()) as {
				suggestions: (FoodOption | null)[];
				foods: FoodOption[];
			};
			open.forEach((r, i) => {
				if (!r.foodId && !r.settled) r.suggestion = result.suggestions[i] ?? null;
			});
			for (const r of linked) {
				const found = result.foods.find((f) => f.id === r.foodId);
				r.units = found?.units ?? ['g'];
				r.food ??= found?.nutrition ?? null;
			}
		} catch {
			// Suggestions are a convenience; every row still has Match food.
		}
	};

	onMount(() => {
		void suggest(items);
	});

	const link = (row: Item, food: FoodOption) => {
		row.foodId = food.id;
		row.foodName = food.name;
		row.units = food.units;
		row.food = food.nutrition ?? null;
		row.foodMatch = undefined;
		row.cleared = false;
		row.suggestion = null;
		row.settled = true;
		row.searchOpen = false;
		row.results = null;
		delete row.errors.food;
	};

	const clearFood = (row: Item) => {
		row.foodId = '';
		row.foodName = '';
		row.grams = '';
		row.gramsSource = undefined;
		row.foodMatch = undefined;
		row.units = null;
		row.food = null;
		row.suggestion = null;
		row.settled = true;
		row.cleared = true;
	};

	const dismiss = (row: Item) => {
		row.suggestion = null;
		row.settled = true;
	};

	const openSearch = (row: Item) => {
		row.searchOpen = true;
		row.query ||= row.name.trim();
		row.results = null;
	};

	const search = async (row: Item) => {
		const q = row.query.trim();
		if (!q) return;
		try {
			const response = await fetch(`${resolve('/plan/foods')}?q=${encodeURIComponent(q)}`);
			if (response.ok && q === row.query.trim()) {
				row.results = ((await response.json()) as { foods: FoodOption[] }).foods;
			}
		} catch {
			row.results = [];
		}
	};

	// "Match with AI": the form's rows go to the server, which fills only open rows.
	let matching = $state(false);
	let matchMessage = $state<string | null>(null);
	const MATCH_MESSAGES: Record<string, string> = {
		limit: 'AI matching is unavailable until tomorrow (daily limit reached).',
		unavailable: 'Foods could not be matched right now. You can link them yourself.',
		cooldown: 'Please wait a few seconds and try again.'
	};

	const matchWithAi = async () => {
		matching = true;
		matchMessage = null;
		try {
			const response = await fetch(resolve('/recipes/food-match'), {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					rows: items.map((r) => ({
						raw: r.raw,
						amount: r.amount,
						unit: r.unit,
						name: r.name,
						foodId: r.foodId,
						grams: r.grams,
						gramsSource: r.gramsSource,
						cleared: r.cleared
					}))
				})
			});
			const result = (await response.json().catch(() => null)) as {
				status: string;
				rows: MatchedRow[];
			} | null;
			if (!result) {
				matchMessage = MATCH_MESSAGES.unavailable;
				return;
			}
			for (const m of result.rows) {
				const row = items[m.index];
				if (!row) continue;
				if (m.foodId !== row.foodId) {
					row.foodId = m.foodId;
					row.foodName = m.foodName;
					row.foodMatch = m.foodMatch ?? undefined;
					row.suggestion = null;
					row.settled = true;
				}
				row.units = m.units;
				row.food = m.nutrition;
				row.grams = m.grams;
				row.gramsSource = m.gramsSource ?? undefined;
			}
			matchMessage =
				MATCH_MESSAGES[result.status] ??
				(result.rows.length > 0
					? `Matched ${result.rows.length} ${result.rows.length === 1 ? 'row' : 'rows'}. Check them, then save.`
					: 'Nothing new to match.');
		} catch {
			matchMessage = MATCH_MESSAGES.unavailable;
		} finally {
			matching = false;
		}
	};

	/** The preview, from the rows' linked foods and weights and the servings field. */
	const previewed = $derived.by(() => {
		if (!preview) return null;
		const rowsForNutrition: IngredientForNutrition[] = items
			.filter((r) => !isBlank(r))
			.map((r) => ({
				name: r.name,
				quantity: parseAmount(r.amount) ?? null,
				unit: r.unit.trim() || null,
				foodId: r.foodId || null,
				grams: r.grams.trim() === '' ? null : Number(r.grams),
				gramsSource: r.gramsSource ?? null
			}));
		const foods = new Map(
			items.flatMap((r) => (r.foodId && r.food ? [[r.foodId, r.food] as const] : []))
		);
		const count = /^\d+$/.test(servings.trim()) ? Number(servings.trim()) : 0;
		return { servings: count, ...recipeNutrition(rowsForNutrition, foods, Math.max(count, 1)) };
	});

	/** A changed name gets a fresh suggestion unless the user already chose. */
	const renamed = (row: Item) => {
		row.suggestion = null;
		void suggest([row]);
	};

	const CHIP: Record<IngredientStatus, string> = {
		parsed: 'bg-[#dcebdd] text-herb-dark',
		check: 'bg-leftover-tint text-[#7a4a06]',
		skipped: 'bg-[#e3e9df] text-muted'
	};
</script>

<fieldset class="flex min-w-0 flex-col gap-3" aria-describedby="ingredients-help">
	<legend class="label mb-1.5">Ingredients</legend>
	<span id="ingredients-help" class="hint">
		Amount, unit, name and an optional note for each ingredient, in the order you want them shown.
		{#if nutrition}Link a food to count the ingredient toward nutrition.{/if}
	</span>
	{#if error}<span class="field-error" role="alert">{error}</span>{/if}

	<div
		class="hidden grid-cols-[5.5rem_6rem_minmax(0,1.6fr)_minmax(0,1fr)_6.5rem_9rem] gap-2 text-xs font-bold tracking-[0.06em] text-muted uppercase xl:grid"
		aria-hidden="true"
	>
		<span>Amount</span><span>Unit</span><span>Name</span><span>Note</span><span>Status</span><span
		></span>
	</div>

	<ol class="flex flex-col gap-3 xl:gap-2">
		{#each items as row, i (row.id)}
			{@const status = isBlank(row) ? null : rowStatus(row)}
			{@const n = i + 1}
			<li
				class="grid grid-cols-2 gap-2 border-t border-[#e3e9df] pt-3 xl:grid-cols-[5.5rem_6rem_minmax(0,1.6fr)_minmax(0,1fr)_6.5rem_9rem] xl:items-start xl:border-0 xl:pt-0"
				data-row={n}
			>
				<input type="hidden" name="ingredientRaw" value={row.raw} />
				<div class="flex flex-col gap-1">
					<label class="sr-only" for="amount-{row.id}">Amount, row {n}</label>
					<input
						id="amount-{row.id}"
						name="ingredientAmount"
						class="input min-h-11 px-2"
						inputmode="decimal"
						placeholder="Amount"
						bind:value={row.amount}
						oninput={() => edited(row)}
						aria-invalid={row.errors.amount ? 'true' : undefined}
						aria-describedby={row.errors.amount ? `amount-error-${row.id}` : undefined}
					/>
				</div>
				<div class="flex flex-col gap-1">
					<label class="sr-only" for="unit-{row.id}">Unit, row {n}</label>
					<input
						id="unit-{row.id}"
						name="ingredientUnit"
						class="input min-h-11 px-2"
						placeholder="Unit"
						bind:value={row.unit}
						oninput={() => edited(row)}
						aria-invalid={row.errors.unit ? 'true' : undefined}
					/>
				</div>
				<div class="col-span-2 flex flex-col gap-1 xl:col-span-1">
					<label class="sr-only" for="name-{row.id}">Name, row {n}</label>
					<input
						id="name-{row.id}"
						name="ingredientName"
						class="input min-h-11 px-2"
						placeholder="Ingredient"
						bind:value={row.name}
						oninput={() => edited(row)}
						onchange={() => renamed(row)}
						aria-invalid={row.errors.name ? 'true' : undefined}
						aria-describedby={row.errors.name ? `name-error-${row.id}` : undefined}
					/>
				</div>
				<div class="col-span-2 flex flex-col gap-1 xl:col-span-1">
					<label class="sr-only" for="note-{row.id}">Note, row {n}</label>
					<input
						id="note-{row.id}"
						name="ingredientNote"
						class="input min-h-11 px-2"
						placeholder="Note"
						bind:value={row.note}
						oninput={() => edited(row)}
						aria-invalid={row.errors.note ? 'true' : undefined}
					/>
				</div>
				<div class="flex min-h-11 items-center">
					{#if status}
						<span
							class="rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap {CHIP[status]}"
							data-status={status}>{STATUS_LABEL[status]}</span
						>
					{/if}
				</div>
				<div class="flex min-h-11 items-center justify-end gap-1">
					<button
						type="button"
						class="btn btn-secondary min-h-11 w-11 px-0"
						aria-label="Move row {n} up"
						disabled={i === 0}
						onclick={() => move(i, -1)}>↑</button
					>
					<button
						type="button"
						class="btn btn-secondary min-h-11 w-11 px-0"
						aria-label="Move row {n} down"
						disabled={i === items.length - 1}
						onclick={() => move(i, 1)}>↓</button
					>
					<button
						type="button"
						class="btn btn-secondary min-h-11 w-11 px-0"
						aria-label="Remove row {n}"
						onclick={() => remove(i)}>×</button
					>
				</div>
				{#if nutrition}
					<input type="hidden" name="ingredientFoodId" value={row.foodId} />
					<input type="hidden" name="ingredientFoodName" value={row.foodName} />
					<input type="hidden" name="ingredientFoodMatch" value={row.foodMatch ?? ''} />
					<input
						type="hidden"
						name="ingredientGramsSource"
						value={needsGrams(row) ? (row.gramsSource ?? '') : ''}
					/>
					{#if !needsGrams(row)}<input type="hidden" name="ingredientGrams" value="" />{/if}
					{#if row.foodId || row.suggestion || !isBlank(row)}
						<div
							class="col-span-2 flex flex-wrap items-center gap-2 text-sm xl:col-span-6"
							data-food={row.foodId ? 'linked' : row.suggestion ? 'suggested' : 'none'}
						>
							{#if row.foodId}
								<span class="min-w-0">Food: <strong>{row.foodName}</strong></span>
								{#if row.foodMatch === 'ai'}
									<span
										class="rounded-full bg-food-tint px-2.5 py-1 text-xs font-bold text-food-ink"
										data-ai-match>AI match</span
									>
								{/if}
								<button
									type="button"
									class="btn btn-secondary min-h-11 px-3"
									aria-label="Change food, row {n}"
									onclick={() => openSearch(row)}>Change</button
								>
								<button
									type="button"
									class="btn btn-secondary min-h-11 px-3"
									aria-label="Clear food, row {n}"
									onclick={() => clearFood(row)}>Clear</button
								>
							{:else if row.suggestion}
								{@const suggestion = row.suggestion}
								<span
									class="rounded-full bg-leftover-tint px-2.5 py-1 text-xs font-bold text-[#7a4a06]"
									>Suggested</span
								>
								<strong class="min-w-0">{suggestion.name}</strong>
								<button
									type="button"
									class="btn btn-secondary min-h-11 px-3"
									aria-label="Use suggested food, row {n}"
									onclick={() => link(row, suggestion)}>Use</button
								>
								<button
									type="button"
									class="btn btn-secondary min-h-11 px-3"
									aria-label="Dismiss suggested food, row {n}"
									onclick={() => dismiss(row)}>Dismiss</button
								>
								<button
									type="button"
									class="btn btn-secondary min-h-11 px-3"
									aria-label="Match food, row {n}"
									onclick={() => openSearch(row)}>Other food</button
								>
							{:else}
								<span class="text-muted">No food linked, so it adds no nutrition.</span>
								<button
									type="button"
									class="btn btn-secondary min-h-11 px-3"
									aria-label="Match food, row {n}"
									onclick={() => openSearch(row)}>Match food</button
								>
							{/if}
						</div>
					{/if}
					{#if needsGrams(row)}
						<div class="col-span-2 flex flex-wrap items-center gap-2 xl:col-span-6">
							<label class="text-sm font-bold" for="grams-{row.id}"
								>{row.gramsSource === 'ai' ? 'AI estimate (g)' : 'About how many grams?'}</label
							>
							<input
								id="grams-{row.id}"
								name="ingredientGrams"
								class="input min-h-11 w-28 px-2"
								inputmode="decimal"
								bind:value={row.grams}
								oninput={() => {
									delete row.errors.grams;
									row.gramsSource = 'user';
								}}
								aria-invalid={row.errors.grams ? 'true' : undefined}
								aria-describedby="grams-help-{row.id}"
							/>
							<span id="grams-help-{row.id}" class="hint">
								{row.gramsSource === 'ai' && row.grams.trim()
									? `AI estimate: ${row.grams} g. Change it if you know better.`
									: row.grams.trim()
										? 'Used for nutrition, since this amount does not convert for the food.'
										: 'This amount does not convert for the food, so it adds no nutrition until you enter a weight.'}
							</span>
						</div>
					{/if}
					{#if row.searchOpen}
						<div
							class="col-span-2 flex flex-col gap-2 rounded-xl border border-[#dde3da] p-3 xl:col-span-6"
						>
							<label class="label" for="food-search-{row.id}">Find a food for row {n}</label>
							<div class="flex flex-wrap gap-2">
								<input
									id="food-search-{row.id}"
									type="search"
									class="input min-h-11 min-w-0 flex-1 px-2"
									bind:value={row.query}
									onkeydown={(e) => {
										if (e.key === 'Enter') {
											e.preventDefault();
											void search(row);
										}
									}}
								/>
								<button type="button" class="btn btn-secondary min-h-11" onclick={() => search(row)}
									>Search</button
								>
								<button
									type="button"
									class="btn btn-secondary min-h-11"
									onclick={() => (row.searchOpen = false)}>Cancel</button
								>
							</div>
							{#if row.results && row.results.length > 0}
								<ul class="flex flex-col gap-1" aria-label="Foods for row {n}">
									{#each row.results as food (food.id)}
										<li>
											<button
												type="button"
												class="flex min-h-11 w-full items-center rounded-lg px-3 text-left hover:bg-herb-tint"
												onclick={() => link(row, food)}
											>
												{food.name}
												{#if food.own}<span class="ml-2 text-xs text-muted">Yours</span>{/if}
											</button>
										</li>
									{/each}
								</ul>
							{:else if row.results}
								<p class="text-sm text-muted">No foods match.</p>
							{/if}
						</div>
					{/if}
				{/if}
				{#if row.raw || Object.keys(row.errors).length > 0}
					<div class="col-span-2 flex flex-col gap-0.5 xl:col-span-6">
						{#if row.raw}<span class="text-[13px] text-muted">As written: {row.raw}</span>{/if}
						{#each Object.entries(row.errors) as [field, message] (field)}
							<span id="{field}-error-{row.id}" class="field-error">{message}</span>
						{/each}
					</div>
				{/if}
			</li>
		{/each}
	</ol>

	<div class="flex flex-wrap items-center gap-2">
		<button type="button" class="btn btn-secondary min-h-11" onclick={addRow}>Add ingredient</button
		>
		{#if nutrition && aiMatch}
			<button
				type="button"
				class="btn btn-secondary min-h-11"
				disabled={matching}
				onclick={matchWithAi}>{matching ? 'Matching…' : 'Match with AI'}</button
			>
		{/if}
		{#if matchMessage}<span class="text-sm text-muted" role="status">{matchMessage}</span>{/if}
	</div>

	{#if previewed}
		<section
			aria-label="Nutrition preview"
			class="flex flex-col gap-2 rounded-xl border border-line bg-white p-4"
			data-preview
		>
			<h3 class="text-sm font-bold text-muted">Nutrition per serving (preview)</h3>
			{#if previewed.servings === 0}
				<p class="text-sm text-muted" data-preview="needs-servings">
					Add servings to see nutrition per serving.
				</p>
			{:else if previewed.counted === 0}
				<p class="text-sm text-muted">No linked foods yet, so there is no nutrition to show.</p>
			{:else}
				<dl class="flex flex-wrap gap-x-6 gap-y-1">
					{#each [['Calories', `${formatKcal(previewed.perServing.kcal)} kcal`], ['Protein', formatGrams(previewed.perServing.proteinG)], ['Carbs', formatGrams(previewed.perServing.carbsG)], ['Fat', formatGrams(previewed.perServing.fatG)]] as [label, value] (label)}
						<div class="flex gap-1.5 text-sm">
							<dt class="text-muted">{label}</dt>
							<dd class="font-bold" data-preview-value={label}>{value}</dd>
						</div>
					{/each}
				</dl>
				{#if previewed.total - previewed.counted > 0}
					<p class="text-[13px] text-[#7a4a06]">
						{`${previewed.total - previewed.counted} of ${previewed.total} ingredients have no nutrition.`}
					</p>
				{/if}
				{#if previewed.estimated > 0}
					<p class="text-[13px] text-muted">
						{`Includes ${previewed.estimated} AI-estimated ${previewed.estimated === 1 ? 'weight' : 'weights'}.`}
					</p>
				{/if}
			{/if}
		</section>
	{/if}

	<div class="flex flex-col gap-1.5 rounded-xl bg-ground p-4">
		<label class="label" for="pastedLines">Paste ingredient lines</label>
		<textarea
			id="pastedLines"
			name="pastedLines"
			class="input py-3 leading-normal"
			rows="3"
			aria-describedby="pastedLines-help"
			bind:value={pasted}></textarea>
		<span id="pastedLines-help" class="hint">
			One per line. Each is split into amount, unit and name for you to check. Lines left here are
			added when you save.
		</span>
		<div>
			<button type="button" class="btn btn-secondary min-h-11" onclick={addLines}>Add lines</button>
		</div>
	</div>
</fieldset>
