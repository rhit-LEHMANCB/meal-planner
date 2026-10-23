<script lang="ts">
	import { resolve } from '$app/paths';
	import { formatMinutes, formatServings, hostname } from '$lib/domain/format';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const recipe = $derived(data.recipe);
	const source = $derived(hostname(recipe.sourceUrl));

	let dialog: HTMLDialogElement;
</script>

<svelte:head><title>{recipe.title}</title></svelte:head>

<div class="flex max-w-[760px] flex-col gap-6">
	<a class="text-sm font-medium text-herb" href={resolve('/recipes')}>‹ Back to recipes</a>

	<header class="flex flex-wrap items-start gap-4">
		<div class="flex flex-[1_1_320px] flex-col gap-2.5">
			<h1 class="font-display text-4xl leading-tight font-bold">{recipe.title}</h1>
			<div class="flex flex-wrap gap-2 text-sm font-medium">
				<span class="rounded-full bg-herb-tint px-3 py-1.5 text-herb-dark">
					{formatServings(recipe.servings)}
				</span>
				{#if recipe.totalMinutes}
					<span class="rounded-full bg-herb-tint px-3 py-1.5 text-herb-dark">
						{formatMinutes(recipe.totalMinutes)}
					</span>
				{/if}
			</div>
			{#if recipe.sourceUrl && source}
				<!-- External link to the recipe's original page, so it is not an in-app route. -->
				<!-- eslint-disable svelte/no-navigation-without-resolve -->
				<a
					class="text-sm font-medium text-herb"
					href={recipe.sourceUrl}
					target="_blank"
					rel="noopener noreferrer">{source} ↗</a
				>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			{/if}
		</div>
		<div class="flex gap-2">
			<a class="btn btn-secondary min-h-11" href={resolve('/recipes/[id]/edit', { id: recipe.id })}
				>Edit</a
			>
			<button
				type="button"
				class="btn min-h-11 border border-danger bg-white text-danger-ink"
				onclick={() => dialog.showModal()}>Delete</button
			>
		</div>
	</header>

	<div class="flex flex-wrap items-start gap-5">
		<section aria-label="Ingredients" class="card min-w-0 flex-[1_1_280px] p-6">
			<h2 class="mb-3 font-display text-xl font-bold">Ingredients</h2>
			{#if recipe.ingredients.length === 0}
				<p class="text-sm text-muted">No ingredients yet.</p>
			{:else}
				<ul class="flex flex-col">
					{#each recipe.ingredients as line, i (i)}
						<li class="border-t border-[#e3e9df] py-2.5">{line}</li>
					{/each}
				</ul>
			{/if}
		</section>
		<section aria-label="Steps" class="card min-w-0 flex-[2_1_340px] p-6">
			<h2 class="mb-3 font-display text-xl font-bold">Steps</h2>
			{#if recipe.instructions.length === 0}
				<p class="text-sm text-muted">No steps yet.</p>
			{:else}
				<ol class="flex list-decimal flex-col gap-3 pl-5 leading-relaxed text-[#2b3b32]">
					{#each recipe.instructions as step, i (i)}
						<li>{step}</li>
					{/each}
				</ol>
			{/if}
		</section>
	</div>
</div>

<dialog
	bind:this={dialog}
	aria-labelledby="delete-title"
	class="m-auto w-full max-w-[440px] rounded-2xl bg-white p-7 backdrop:bg-ink/55"
>
	<form method="POST" action="?/delete" class="flex flex-col gap-4">
		<h2 id="delete-title" class="font-display text-2xl font-bold">Delete this recipe?</h2>
		<p class="leading-relaxed text-[#3f5247]">
			"{recipe.title}" and its ingredients will be removed. This cannot be undone.
		</p>
		<div class="flex flex-wrap justify-end gap-3">
			<button type="button" class="btn btn-secondary" onclick={() => dialog.close()}>Cancel</button>
			<button type="submit" class="btn btn-danger">Delete recipe</button>
		</div>
	</form>
</dialog>
