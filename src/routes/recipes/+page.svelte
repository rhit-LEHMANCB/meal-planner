<script lang="ts">
	import { resolve } from '$app/paths';
	import { formatMinutes, formatServings, hostname } from '$lib/domain/format';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const meta = (r: PageProps['data']['recipes'][number]) =>
		[formatServings(r.servings), r.totalMinutes ? formatMinutes(r.totalMinutes) : null]
			.filter(Boolean)
			.join(' · ');

	const foot = (r: PageProps['data']['recipes'][number]) =>
		`${r.ingredientCount} ${r.ingredientCount === 1 ? 'ingredient' : 'ingredients'} · ${hostname(r.sourceUrl) ?? 'no source link'}`;
</script>

<svelte:head><title>Recipes</title></svelte:head>

<div class="flex flex-col gap-6">
	<header class="flex flex-wrap items-center gap-4">
		<h1 class="flex-[1_1_200px] font-display text-4xl leading-tight font-bold">Recipes</h1>
		{#if data.total > 0}
			<form method="GET" class="flex max-w-[460px] flex-[1_1_320px] gap-2" role="search">
				<label class="sr-only" for="q">Search recipes</label>
				<input
					id="q"
					name="q"
					class="input min-h-11"
					type="search"
					placeholder="Search by title"
					value={data.q}
				/>
				<button class="btn btn-secondary min-h-11" type="submit">Search</button>
			</form>
		{/if}
		<a class="btn btn-secondary min-h-11" href={resolve('/recipes/import')}>Import recipe</a>
		<a class="btn btn-primary min-h-11" href={resolve('/recipes/new')}>Add recipe</a>
	</header>

	{#if data.total === 0}
		<section
			class="flex flex-col items-start gap-2.5 rounded-[14px] border border-dashed border-[#aeb9ab] bg-white p-7"
		>
			<h2 class="font-display text-xl font-bold">No recipes yet</h2>
			<p class="max-w-[520px] text-muted">
				You have no recipes yet. Add your first one to start planning meals.
			</p>
			<div class="flex flex-wrap gap-3">
				<a class="btn btn-primary min-h-11" href={resolve('/recipes/new')}>Add your first recipe</a>
				<a class="btn btn-secondary min-h-11" href={resolve('/recipes/import')}>Import a recipe</a>
			</div>
		</section>
	{:else if data.recipes.length === 0}
		<section class="card flex flex-col items-start gap-2.5 p-7">
			<h2 class="font-display text-xl font-bold">No recipes match "{data.q}"</h2>
			<a class="font-bold text-herb" href={resolve('/recipes')}>Clear search</a>
		</section>
	{:else}
		{#if data.q}
			<p class="text-sm text-muted">
				Showing {data.recipes.length} of {data.total}
				{data.total === 1 ? 'recipe' : 'recipes'} matching "{data.q}".
				<a class="font-bold text-herb" href={resolve('/recipes')}>Clear search</a>
			</p>
		{/if}
		<ul class="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
			{#each data.recipes as r (r.id)}
				<li>
					<a
						href={resolve('/recipes/[id]', { id: r.id })}
						class="flex h-full flex-col gap-2.5 rounded-[14px] border border-t-4 border-line border-t-herb bg-white p-5 text-ink no-underline hover:bg-herb-tint"
					>
						<span class="font-display text-xl leading-tight font-bold">{r.title}</span>
						<span class="text-sm text-muted">{meta(r)}</span>
						<span class="mt-auto text-[13px] text-muted">{foot(r)}</span>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</div>
