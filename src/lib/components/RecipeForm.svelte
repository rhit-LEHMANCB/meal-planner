<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import type { RecipeField, RecipeFormValues } from '$lib/domain/recipe-form';

	let {
		values,
		errors = {},
		submitLabel,
		cancelHref
	}: {
		values: RecipeFormValues;
		errors?: Partial<Record<RecipeField, string>>;
		submitLabel: string;
		cancelHref: string;
	} = $props();

	let busy = $state(false);
</script>

<form
	method="POST"
	class="card flex flex-col gap-5 p-7"
	use:enhance={() => {
		busy = true;
		return async ({ update }) => {
			await update({ reset: false });
			busy = false;
		};
	}}
>
	{#if Object.keys(errors).length > 0}
		<div role="alert" class="notice notice-error">Fix the highlighted fields and save again.</div>
	{/if}

	<div class="flex flex-col gap-1.5">
		<label class="label" for="title">Title</label>
		<input
			id="title"
			name="title"
			class="input text-lg font-bold"
			type="text"
			required
			value={values.title}
			aria-invalid={errors.title ? 'true' : undefined}
			aria-describedby={errors.title ? 'title-error' : undefined}
		/>
		{#if errors.title}<span id="title-error" class="field-error">{errors.title}</span>{/if}
	</div>

	<div class="flex flex-wrap gap-4">
		<div class="flex min-w-[140px] flex-1 flex-col gap-1.5">
			<label class="label" for="servings">Servings</label>
			<input
				id="servings"
				name="servings"
				class="input"
				type="text"
				inputmode="numeric"
				required
				value={values.servings}
				aria-invalid={errors.servings ? 'true' : undefined}
				aria-describedby={errors.servings ? 'servings-error' : undefined}
			/>
			{#if errors.servings}<span id="servings-error" class="field-error">{errors.servings}</span
				>{/if}
		</div>
		<div class="flex min-w-[140px] flex-1 flex-col gap-1.5">
			<label class="label" for="totalMinutes">Total time (minutes, optional)</label>
			<input
				id="totalMinutes"
				name="totalMinutes"
				class="input"
				type="text"
				inputmode="numeric"
				value={values.totalMinutes}
				aria-invalid={errors.totalMinutes ? 'true' : undefined}
				aria-describedby={errors.totalMinutes ? 'totalMinutes-error' : undefined}
			/>
			{#if errors.totalMinutes}<span id="totalMinutes-error" class="field-error"
					>{errors.totalMinutes}</span
				>{/if}
		</div>
	</div>

	<div class="flex flex-col gap-1.5">
		<label class="label" for="sourceUrl">Source link (optional)</label>
		<input
			id="sourceUrl"
			name="sourceUrl"
			class="input"
			type="text"
			inputmode="url"
			value={values.sourceUrl}
			aria-invalid={errors.sourceUrl ? 'true' : undefined}
			aria-describedby={errors.sourceUrl ? 'sourceUrl-error' : undefined}
		/>
		{#if errors.sourceUrl}<span id="sourceUrl-error" class="field-error">{errors.sourceUrl}</span
			>{/if}
	</div>

	<div class="flex flex-col gap-1.5">
		<label class="label" for="ingredients">Ingredients</label>
		<textarea
			id="ingredients"
			name="ingredients"
			class="input py-3 leading-normal"
			rows="9"
			aria-describedby="ingredients-help"
			aria-invalid={errors.ingredients ? 'true' : undefined}>{values.ingredients}</textarea
		>
		{#if errors.ingredients}<span class="field-error">{errors.ingredients}</span>{/if}
		<span id="ingredients-help" class="hint">
			One ingredient per line, in the order you want them shown.
		</span>
	</div>

	<div class="flex flex-col gap-1.5">
		<label class="label" for="steps">Steps</label>
		<textarea
			id="steps"
			name="steps"
			class="input py-3 leading-normal"
			rows="7"
			aria-describedby="steps-help"
			aria-invalid={errors.steps ? 'true' : undefined}>{values.steps}</textarea
		>
		{#if errors.steps}<span class="field-error">{errors.steps}</span>{/if}
		<span id="steps-help" class="hint">One step per line.</span>
	</div>

	<div class="flex flex-wrap justify-end gap-3">
		<a class="btn btn-secondary" href={resolve(cancelHref as '/recipes')}>Cancel</a>
		<button class="btn btn-primary" type="submit" disabled={busy}>
			{busy ? 'Saving…' : submitLabel}
		</button>
	</div>
</form>
