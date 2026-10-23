<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { formatServings } from '$lib/domain/format';
	import { formatAmount } from '$lib/domain/ingredient-line';
	import {
		dayName,
		eatByFor,
		isAfterCook,
		isPastEatBy,
		monthDay,
		SLOT_LABELS,
		type Batch,
		type PlanEntry,
		type Slot
	} from '$lib/domain/plan';

	interface RecipeOption {
		id: string;
		title: string;
		servings: number;
	}

	interface FoodOption {
		id: string;
		name: string;
		own: boolean;
		units: string[];
	}

	type Tab = 'recipe' | 'leftover' | 'food';

	let {
		target,
		editing,
		presetRecipeId,
		recipes,
		batches,
		onclose
	}: {
		/** The slot to add to; the dialog is open while this or `editing` is set. */
		target: { date: string; slot: Slot } | null;
		editing: PlanEntry | null;
		/** A recipe dropped on the slot: opens the Recipe tab with it selected. */
		presetRecipeId?: string;
		recipes: RecipeOption[];
		batches: Batch[];
		onclose: () => void;
	} = $props();

	let dialog: HTMLDialogElement;
	let tab = $state<Tab>('recipe');
	let errors = $state<Record<string, string>>({});
	let busy = $state(false);

	// Recipe tab
	let recipeQuery = $state('');
	let recipeId = $state('');
	let cooked = $state(1);
	let eaten = $state(1);

	// Leftover tab
	let batchId = $state('');
	let servings = $state(1);

	// Food tab
	let foodQuery = $state('');
	let foods = $state<FoodOption[]>([]);
	let searched = $state('');
	let searching = $state(false);
	let foodId = $state('');
	let amount = $state('');
	let unit = $state('g');
	let creating = $state(false);
	let newFoodName = $state('');

	const slotRef = $derived(editing ?? target);
	const where = $derived(
		slotRef ? `${dayName(slotRef.date)} ${SLOT_LABELS[slotRef.slot].toLowerCase()}` : ''
	);
	const title = $derived(editing ? `Edit ${editing.title}` : `Add to ${where}`);

	const shownRecipes = $derived.by(() => {
		const q = recipeQuery.trim().toLowerCase();
		return q ? recipes.filter((r) => r.title.toLowerCase().includes(q)) : recipes;
	});

	/** Batches cooked before this slot with servings still free. */
	const usableBatches = $derived(
		target
			? batches.filter(
					(b) =>
						b.thrownOutAt === null &&
						b.free > 0 &&
						isAfterCook({ date: b.cookedOn, slot: b.cookSlot ?? 'breakfast' }, target)
				)
			: []
	);
	const chosenFood = $derived(foods.find((f) => f.id === foodId));
	const spare = $derived(Math.max(0, cooked - eaten));
	const fridgeHint = (date: string) => {
		const eatBy = eatByFor(date);
		return `${formatServings(spare)} ${spare === 1 ? 'goes' : 'go'} to the fridge as leftovers, eat by ${dayName(eatBy)} ${monthDay(eatBy)}.`;
	};
	/** A new custom food only has grams; an existing one has its own units too. */
	const unitChoices = $derived(creating ? ['g'] : (chosenFood?.units ?? ['g']));

	const reset = () => {
		errors = {};
		busy = false;
		recipeQuery = '';
		const preset = recipes.find((r) => r.id === presetRecipeId);
		recipeId = preset?.id ?? '';
		cooked = preset?.servings ?? 1;
		eaten = 1;
		batchId = '';
		servings = 1;
		foodQuery = '';
		foods = [];
		searched = '';
		foodId = '';
		amount = '';
		unit = 'g';
		creating = false;
		newFoodName = '';
		tab = 'recipe';
		if (editing) {
			cooked = editing.cooked ?? 1;
			eaten = editing.servings;
			servings = editing.servings;
			amount = editing.amount === null ? '' : String(editing.amount);
			unit = editing.unit ?? 'g';
		}
	};

	$effect(() => {
		if ((target || editing) && !dialog.open) {
			// Only opening the dialog should reset it, not later changes to the data it reads.
			untrack(reset);
			dialog.showModal();
		}
	});

	const pickRecipe = (recipe: RecipeOption) => {
		recipeId = recipe.id;
		cooked = recipe.servings;
		eaten = Math.min(eaten, cooked);
	};

	let timer: ReturnType<typeof setTimeout> | undefined;
	const searchFoods = () => {
		clearTimeout(timer);
		creating = false;
		const q = foodQuery.trim();
		if (!q) {
			foods = [];
			searched = '';
			return;
		}
		timer = setTimeout(async () => {
			searching = true;
			try {
				const response = await fetch(`${resolve('/plan/foods')}?q=${encodeURIComponent(q)}`);
				if (response.ok && q === foodQuery.trim()) {
					foods = ((await response.json()) as { foods: FoodOption[] }).foods;
					searched = q;
					if (!foods.some((f) => f.id === foodId)) foodId = '';
				}
			} finally {
				searching = false;
			}
		}, 200);
	};

	const startCreate = () => {
		creating = true;
		foodId = '';
		unit = 'g';
		newFoodName = foodQuery.trim();
	};

	const submit: SubmitFunction = () => {
		busy = true;
		errors = {};
		return async ({ result, update }) => {
			busy = false;
			if (result.type === 'success') {
				dialog.close();
				await update();
			} else if (result.type === 'failure') {
				errors = (result.data?.errors as Record<string, string> | undefined) ?? {
					form: 'That did not work. Try again.'
				};
			} else {
				await update();
			}
		};
	};

	const tabs: { id: Tab; label: string }[] = [
		{ id: 'recipe', label: 'Recipe' },
		{ id: 'leftover', label: 'Leftover' },
		{ id: 'food', label: 'Food' }
	];

	/** Left and right arrows move between tabs, as in any tab list. */
	const tabKeys = (event: KeyboardEvent) => {
		if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
		const i = tabs.findIndex((t) => t.id === tab);
		const next = tabs[(i + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
		tab = next.id;
		document.getElementById(`add-tab-${next.id}`)?.focus();
	};

	const describe = (field: string) => (errors[field] ? `add-error-${field}` : undefined);
</script>

{#snippet fieldError(field: string)}
	{#if errors[field]}
		<p id="add-error-{field}" class="field-error">{errors[field]}</p>
	{/if}
{/snippet}

{#snippet slotFields()}
	{#if target}
		<input type="hidden" name="date" value={target.date} />
		<input type="hidden" name="slot" value={target.slot} />
	{/if}
{/snippet}

{#snippet footer(label: string, disabled = false)}
	<div class="flex flex-wrap justify-end gap-2.5 border-t border-line pt-4">
		<button type="button" class="btn btn-secondary min-h-11" onclick={() => dialog.close()}
			>Cancel</button
		>
		<button type="submit" class="btn btn-primary min-h-11" disabled={busy || disabled}
			>{label}</button
		>
	</div>
{/snippet}

<dialog
	bind:this={dialog}
	aria-labelledby="add-title"
	class="m-auto w-[calc(100%-32px)] max-w-[640px] rounded-[20px] bg-white p-0 text-ink backdrop:bg-ink/55"
	{onclose}
>
	<div class="flex flex-col">
		<header class="flex items-start gap-3 px-6 pt-6 pb-2">
			<div class="flex-1">
				<h2 id="add-title" class="font-display text-[26px] font-bold">{title}</h2>
				{#if editing}<p class="text-sm text-muted">{where}</p>{/if}
			</div>
			<button
				type="button"
				class="grid size-11 cursor-pointer place-items-center rounded-[10px] border border-edge text-xl"
				aria-label="Close"
				onclick={() => dialog.close()}>×</button
			>
		</header>

		{#if errors.form}
			<div role="alert" class="notice notice-error mx-6 mt-2">{errors.form}</div>
		{/if}

		{#if editing}
			<form
				method="POST"
				action="?/updateEntry"
				class="flex flex-col gap-4 px-6 pt-4 pb-6"
				use:enhance={submit}
			>
				<input type="hidden" name="entryId" value={editing.id} />
				<input type="hidden" name="kind" value={editing.kind} />
				{#if editing.kind === 'cook'}
					<div class="grid grid-cols-2 gap-3">
						<label class="flex flex-col gap-1.5">
							<span class="label">Servings to cook</span>
							<input
								class="input"
								type="number"
								name="cooked"
								min="1"
								max="99"
								bind:value={cooked}
								aria-invalid={errors.cooked ? 'true' : undefined}
								aria-describedby={describe('cooked')}
							/>
							{@render fieldError('cooked')}
						</label>
						<label class="flex flex-col gap-1.5">
							<span class="label">Eaten at this meal</span>
							<input
								class="input"
								type="number"
								name="eaten"
								min="1"
								max="99"
								bind:value={eaten}
								aria-invalid={errors.eaten ? 'true' : undefined}
								aria-describedby={describe('eaten')}
							/>
							{@render fieldError('eaten')}
						</label>
					</div>
					{#if editing.drawn > 0}
						<p class="hint">
							{formatServings(editing.drawn)} from this cook {editing.drawn === 1 ? 'is' : 'are'} planned
							as leftovers.
						</p>
					{/if}
				{:else if editing.kind === 'leftover'}
					<label class="flex max-w-[200px] flex-col gap-1.5">
						<span class="label">Servings</span>
						<input
							class="input"
							type="number"
							name="servings"
							min="1"
							max="99"
							bind:value={servings}
							aria-invalid={errors.servings ? 'true' : undefined}
							aria-describedby={describe('servings')}
						/>
						{@render fieldError('servings')}
					</label>
				{:else}
					<div class="grid grid-cols-2 gap-3">
						<label class="flex flex-col gap-1.5">
							<span class="label">Amount</span>
							<input
								class="input"
								type="text"
								inputmode="decimal"
								name="amount"
								bind:value={amount}
								aria-invalid={errors.amount ? 'true' : undefined}
								aria-describedby={describe('amount')}
							/>
							{@render fieldError('amount')}
						</label>
						<label class="flex flex-col gap-1.5">
							<span class="label">Unit</span>
							<select class="input" name="unit" bind:value={unit}>
								{#each editing.units as u (u)}<option value={u}>{u}</option>{/each}
							</select>
							{@render fieldError('unit')}
						</label>
					</div>
				{/if}
				{@render footer('Save changes')}
			</form>
		{:else}
			<div
				role="tablist"
				aria-label="What to add"
				tabindex="-1"
				class="mx-6 mt-3 flex gap-1 rounded-xl bg-[#eef1ea] p-1"
				onkeydown={tabKeys}
			>
				{#each tabs as t (t.id)}
					<button
						type="button"
						role="tab"
						id="add-tab-{t.id}"
						aria-selected={tab === t.id}
						aria-controls="add-panel-{t.id}"
						tabindex={tab === t.id ? 0 : -1}
						class="min-h-11 flex-1 cursor-pointer rounded-[9px] text-[15px] font-bold {tab === t.id
							? 'bg-white text-herb-dark shadow-sm'
							: 'text-[#3f5247]'}"
						onclick={() => {
							tab = t.id;
							errors = {};
						}}>{t.label}</button
					>
				{/each}
			</div>

			{#if tab === 'recipe'}
				<div id="add-panel-recipe" role="tabpanel" aria-labelledby="add-tab-recipe">
					<form
						method="POST"
						action="?/addCook"
						class="flex flex-col gap-4 px-6 pt-5 pb-6"
						use:enhance={submit}
					>
						{@render slotFields()}
						{#if recipes.length === 0}
							<p class="text-sm text-muted">
								No recipes yet. <a class="font-bold text-herb" href={resolve('/recipes/new')}
									>Add a recipe</a
								> first.
							</p>
						{:else}
							<label class="flex flex-col gap-1.5">
								<span class="label">Search recipes</span>
								<input class="input" type="search" bind:value={recipeQuery} />
							</label>
							<fieldset class="flex max-h-60 flex-col gap-1.5 overflow-y-auto">
								<legend class="sr-only">Recipe</legend>
								{#each shownRecipes as recipe (recipe.id)}
									<label
										class="flex min-h-[52px] cursor-pointer items-center gap-3 rounded-[10px] px-3.5 {recipeId ===
										recipe.id
											? 'border-2 border-herb bg-herb-tint'
											: 'border border-line'}"
									>
										<input
											type="radio"
											name="recipeId"
											value={recipe.id}
											checked={recipeId === recipe.id}
											onchange={() => pickRecipe(recipe)}
										/>
										<span class="flex-1 font-bold">{recipe.title}</span>
										<span class="text-[13px] text-muted">makes {recipe.servings}</span>
									</label>
								{:else}
									<p class="text-sm text-muted">No recipes match “{recipeQuery}”.</p>
								{/each}
							</fieldset>
							{@render fieldError('recipeId')}
							<div class="grid grid-cols-2 gap-3">
								<label class="flex flex-col gap-1.5">
									<span class="label">Servings to cook</span>
									<input
										class="input"
										type="number"
										name="cooked"
										min="1"
										max="99"
										bind:value={cooked}
										aria-invalid={errors.cooked ? 'true' : undefined}
										aria-describedby={describe('cooked')}
									/>
									{@render fieldError('cooked')}
								</label>
								<label class="flex flex-col gap-1.5">
									<span class="label">Eaten at this meal</span>
									<input
										class="input"
										type="number"
										name="eaten"
										min="1"
										max="99"
										bind:value={eaten}
										aria-invalid={errors.eaten ? 'true' : undefined}
										aria-describedby={describe('eaten')}
									/>
									{@render fieldError('eaten')}
								</label>
							</div>
							{#if target && spare > 0}
								<p class="notice notice-warn">{fridgeHint(target.date)}</p>
							{/if}
						{/if}
						{@render footer('Add cook', recipes.length === 0)}
					</form>
				</div>
			{:else if tab === 'leftover'}
				<div id="add-panel-leftover" role="tabpanel" aria-labelledby="add-tab-leftover">
					<form
						method="POST"
						action="?/addLeftover"
						class="flex flex-col gap-4 px-6 pt-5 pb-6"
						use:enhance={submit}
					>
						{@render slotFields()}
						{#if usableBatches.length === 0}
							<p class="text-sm text-muted">
								No leftovers are free for {where}. Cook a recipe in an earlier slot to make some.
							</p>
						{:else}
							<p class="text-sm text-muted">
								Batches cooked before {where} with servings not yet planned.
							</p>
							<fieldset class="flex flex-col gap-1.5">
								<legend class="sr-only">Batch</legend>
								{#each usableBatches as batch (batch.id)}
									{@const late = target ? isPastEatBy(batch.eatBy, target.date) : false}
									<label
										class="flex cursor-pointer items-center gap-3 rounded-[10px] bg-leftover-tint px-3.5 py-3 {batchId ===
										batch.id
											? 'border-2 border-leftover'
											: 'border border-dashed border-leftover'}"
									>
										<input
											type="radio"
											name="batchId"
											value={batch.id}
											checked={batchId === batch.id}
											onchange={() => {
												batchId = batch.id;
												servings = Math.min(servings, batch.free);
											}}
										/>
										<span class="min-w-0 flex-1">
											<span class="block font-bold text-leftover-ink">{batch.title}</span>
											<span class="block text-[13px] text-[#6b4a12]">
												Cooked {dayName(batch.cookedOn)}
												{monthDay(batch.cookedOn)}{batch.eatBy
													? ` · eat by ${dayName(batch.eatBy)} ${monthDay(batch.eatBy)}`
													: ''}
											</span>
											{#if late}
												<span class="mt-1 block text-[13px] font-bold text-danger-ink"
													>Past eat-by. You can still add it.</span
												>
											{/if}
										</span>
										<span class="font-display text-lg font-bold text-leftover-ink"
											>{batch.free} free</span
										>
									</label>
								{/each}
							</fieldset>
							{@render fieldError('batchId')}
							<label class="flex max-w-[200px] flex-col gap-1.5">
								<span class="label">Servings</span>
								<input
									class="input"
									type="number"
									name="servings"
									min="1"
									bind:value={servings}
									aria-invalid={errors.servings ? 'true' : undefined}
									aria-describedby={describe('servings')}
								/>
								{@render fieldError('servings')}
							</label>
						{/if}
						{@render footer('Add leftover', usableBatches.length === 0)}
					</form>
				</div>
			{:else}
				<div id="add-panel-food" role="tabpanel" aria-labelledby="add-tab-food">
					<form
						method="POST"
						action="?/addFood"
						class="flex flex-col gap-4 px-6 pt-5 pb-6"
						use:enhance={submit}
					>
						{@render slotFields()}
						<label class="flex flex-col gap-1.5">
							<span class="label">Search foods</span>
							<input
								class="input"
								type="search"
								bind:value={foodQuery}
								oninput={searchFoods}
								autocomplete="off"
							/>
						</label>
						{#if creating}
							<input type="hidden" name="create" value="1" />
							<div class="flex flex-col gap-3 rounded-xl border border-food-edge bg-[#f6f7fb] p-4">
								<h3 class="font-bold">Create “{newFoodName || foodQuery.trim()}”</h3>
								<label class="flex flex-col gap-1.5">
									<span class="label">Name</span>
									<input
										class="input"
										type="text"
										name="newFoodName"
										maxlength="120"
										bind:value={newFoodName}
										aria-invalid={errors.newFoodName ? 'true' : undefined}
										aria-describedby={describe('newFoodName')}
									/>
									{@render fieldError('newFoodName')}
								</label>
								<div class="text-[13px] font-bold text-food-muted">Per 100 g</div>
								<div class="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
									{#each [['kcal', 'kcal'], ['protein', 'Protein g'], ['carbs', 'Carbs g'], ['fat', 'Fat g']] as [name, label] (name)}
										<label class="flex min-w-0 flex-col gap-1.5">
											<span class="label">{label}</span>
											<input
												class="input"
												type="text"
												inputmode="decimal"
												{name}
												aria-invalid={errors[name] ? 'true' : undefined}
												aria-describedby={describe(name)}
											/>
											{@render fieldError(name)}
										</label>
									{/each}
								</div>
								<p class="hint">Saved to your foods so you can pick it again.</p>
							</div>
						{:else if foods.length > 0}
							<fieldset class="flex max-h-60 flex-col gap-1.5 overflow-y-auto">
								<legend class="sr-only">Food</legend>
								{#each foods as food (food.id)}
									<label
										class="flex min-h-12 cursor-pointer items-center gap-3 rounded-[10px] px-3.5 {foodId ===
										food.id
											? 'border-2 border-food-ink bg-food-tint'
											: 'border border-line'}"
									>
										<input
											type="radio"
											name="foodId"
											value={food.id}
											checked={foodId === food.id}
											onchange={() => {
												foodId = food.id;
												unit = 'g';
											}}
										/>
										<span class="flex-1 font-bold">{food.name}</span>
										{#if food.own}<span class="text-[13px] text-muted">your food</span>{/if}
									</label>
								{/each}
							</fieldset>
							{@render fieldError('foodId')}
						{:else if searched && !searching}
							<p class="text-sm text-muted">No foods match “{searched}”.</p>
						{/if}
						{#if !creating && foodQuery.trim() && !searching && searched === foodQuery.trim()}
							<button
								type="button"
								class="btn btn-secondary min-h-11 self-start"
								onclick={startCreate}>Create “{foodQuery.trim()}”</button
							>
						{/if}
						<div class="grid grid-cols-2 gap-3">
							<label class="flex flex-col gap-1.5">
								<span class="label">Amount</span>
								<input
									class="input"
									type="text"
									inputmode="decimal"
									name="amount"
									bind:value={amount}
									aria-invalid={errors.amount ? 'true' : undefined}
									aria-describedby={describe('amount')}
								/>
								{@render fieldError('amount')}
							</label>
							<label class="flex flex-col gap-1.5">
								<span class="label">Unit</span>
								<select class="input" name="unit" bind:value={unit}>
									{#each unitChoices as u (u)}
										<option value={u}>{u}</option>
									{/each}
								</select>
								{@render fieldError('unit')}
							</label>
						</div>
						{#if chosenFood && amount}
							<p class="hint">{chosenFood.name}, {formatAmount(Number(amount) || 0)} {unit}</p>
						{/if}
						{@render footer(creating ? 'Create food and add' : 'Add food', !creating && !foodId)}
					</form>
				</div>
			{/if}
		{/if}
	</div>
</dialog>
