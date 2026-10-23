<script lang="ts">
	import { resolve } from '$app/paths';
	import RecipeForm from '$lib/components/RecipeForm.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head><title>New recipe</title></svelte:head>

<div class="flex max-w-[1100px] flex-col gap-6">
	<div>
		<a class="text-sm font-medium text-herb" href={resolve('/recipes')}>‹ Back to recipes</a>
		<h1 class="mt-2 font-display text-4xl leading-tight font-bold">New recipe</h1>
	</div>
	<RecipeForm
		values={form?.values ?? data.values}
		errors={form?.errors}
		submitLabel="Save recipe"
		cancelHref="/recipes"
	/>
</div>
