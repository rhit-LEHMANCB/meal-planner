<script lang="ts">
	import { resolve } from '$app/paths';
	import { RECIPE_DRAG_TYPE } from '$lib/domain/plan';

	let { recipes }: { recipes: { id: string; title: string }[] } = $props();
</script>

<section
	aria-labelledby="shelf-title"
	class="card flex min-w-0 flex-[1_1_380px] flex-col gap-3.5 p-5"
>
	<div class="flex items-center gap-3">
		<h2 id="shelf-title" class="flex-1 font-display text-xl font-bold">Recipe shelf</h2>
		<a class="text-sm font-bold text-herb" href={resolve('/recipes')}>All recipes</a>
	</div>
	{#if recipes.length === 0}
		<p class="text-sm text-muted">
			No recipes yet. <a class="font-bold text-herb" href={resolve('/recipes/new')}>Add one</a> to start
			planning.
		</p>
	{:else}
		<ul class="flex flex-wrap gap-2">
			{#each recipes as recipe (recipe.id)}
				<li
					draggable="true"
					data-testid="shelf-recipe"
					class="flex cursor-grab items-center gap-1.5 rounded-full bg-herb-tint py-2 pr-3 pl-2 text-[13px] font-medium text-herb-dark active:cursor-grabbing"
					ondragstart={(event) => {
						event.dataTransfer?.setData(RECIPE_DRAG_TYPE, recipe.id);
						event.dataTransfer?.setData('text/plain', recipe.title);
						if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
					}}
				>
					<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"
						><circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" /><circle
							cx="9"
							cy="12"
							r="1.6"
						/><circle cx="15" cy="12" r="1.6" /><circle cx="9" cy="18" r="1.6" /><circle
							cx="15"
							cy="18"
							r="1.6"
						/></svg
					>
					{recipe.title}
				</li>
			{/each}
		</ul>
		<p class="text-[13px] text-muted">
			Drag a recipe onto a slot to cook it there, then set servings. Or use + Add in any slot.
		</p>
	{/if}
</section>
