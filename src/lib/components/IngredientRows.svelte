<script lang="ts">
	import {
		parseIngredientLine,
		STATUS_LABEL,
		type IngredientStatus
	} from '$lib/domain/ingredient-line';
	import {
		emptyRow,
		lineToRow,
		parseLines,
		rowStatus,
		type IngredientRowValues,
		type RowErrors
	} from '$lib/domain/recipe-form';

	let {
		rows,
		errors = {},
		error
	}: {
		/** Starting rows. Re-mount the component (with `{#key}`) to start over from new rows. */
		rows: IngredientRowValues[];
		/** Errors by index in `rows`. */
		errors?: Record<number, RowErrors>;
		/** A message about the ingredient list as a whole. */
		error?: string;
	} = $props();

	interface Item extends IngredientRowValues {
		id: number;
		errors: RowErrors;
	}

	let nextId = 0;
	const item = (row: IngredientRowValues, rowErrors: RowErrors = {}): Item => ({
		id: nextId++,
		...row,
		errors: rowErrors
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
	</span>
	{#if error}<span class="field-error" role="alert">{error}</span>{/if}

	<div
		class="hidden grid-cols-[5.5rem_6rem_minmax(0,1.6fr)_minmax(0,1fr)_6.5rem_8.5rem] gap-2 text-xs font-bold tracking-[0.06em] text-muted uppercase md:grid"
		aria-hidden="true"
	>
		<span>Amount</span><span>Unit</span><span>Name</span><span>Note</span><span>Status</span><span
		></span>
	</div>

	<ol class="flex flex-col gap-3 md:gap-2">
		{#each items as row, i (row.id)}
			{@const status = isBlank(row) ? null : rowStatus(row)}
			{@const n = i + 1}
			<li
				class="grid grid-cols-2 gap-2 border-t border-[#e3e9df] pt-3 md:grid-cols-[5.5rem_6rem_minmax(0,1.6fr)_minmax(0,1fr)_6.5rem_8.5rem] md:items-start md:border-0 md:pt-0"
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
				<div class="col-span-2 flex flex-col gap-1 md:col-span-1">
					<label class="sr-only" for="name-{row.id}">Name, row {n}</label>
					<input
						id="name-{row.id}"
						name="ingredientName"
						class="input min-h-11 px-2"
						placeholder="Ingredient"
						bind:value={row.name}
						oninput={() => edited(row)}
						aria-invalid={row.errors.name ? 'true' : undefined}
						aria-describedby={row.errors.name ? `name-error-${row.id}` : undefined}
					/>
				</div>
				<div class="col-span-2 flex flex-col gap-1 md:col-span-1">
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
				{#if row.raw || Object.keys(row.errors).length > 0}
					<div class="col-span-2 flex flex-col gap-0.5 md:col-span-6">
						{#if row.raw}<span class="text-[13px] text-muted">As written: {row.raw}</span>{/if}
						{#each Object.entries(row.errors) as [field, message] (field)}
							<span id="{field}-error-{row.id}" class="field-error">{message}</span>
						{/each}
					</div>
				{/if}
			</li>
		{/each}
	</ol>

	<div>
		<button type="button" class="btn btn-secondary min-h-11" onclick={addRow}>Add ingredient</button
		>
	</div>

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
