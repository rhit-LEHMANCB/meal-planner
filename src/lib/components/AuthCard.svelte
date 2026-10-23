<script lang="ts">
	import type { Snippet } from 'svelte';

	let { title, children }: { title: string; children: Snippet } = $props();
</script>

<div class="flex min-h-screen items-center justify-center px-4 py-8">
	<main class="card flex w-full max-w-[420px] flex-col gap-5 p-8">
		<div class="font-display text-[22px] font-bold text-herb">Meal Planner</div>
		<h1 class="font-display text-3xl leading-tight font-bold">{title}</h1>
		{@render children()}
	</main>
</div>
