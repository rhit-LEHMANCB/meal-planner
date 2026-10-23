<script lang="ts">
	import { resolve } from '$app/paths';
	import { dayName, type Batch } from '$lib/domain/plan';

	let { batches }: { batches: Batch[] } = $props();
</script>

<section
	aria-labelledby="fridge-title"
	class="card flex min-w-0 flex-[1_1_380px] flex-col gap-3 p-5"
>
	<div class="flex items-center gap-3">
		<h2 id="fridge-title" class="flex-1 font-display text-xl font-bold">In the fridge</h2>
		<a class="text-sm font-bold text-herb" href={resolve('/leftovers')}>Leftovers</a>
	</div>
	{#if batches.length === 0}
		<p class="text-sm text-muted">
			Nothing yet. Cooking more servings than you eat makes leftovers.
		</p>
	{:else}
		<ul class="flex flex-col gap-2">
			{#each batches as batch (batch.id)}
				{@const planned = batch.draws.reduce((sum, d) => sum + d.servings, 0)}
				<li class="flex items-center gap-3 rounded-xl bg-leftover-tint p-3">
					<div class="min-w-0 flex-1">
						<div class="text-sm font-bold text-leftover-ink">{batch.title}</div>
						<div class="text-xs text-[#6b4a12]">
							Cooked {dayName(batch.cookedOn)}{batch.eatBy
								? ` · eat by ${dayName(batch.eatBy)}`
								: ''}
						</div>
					</div>
					<div class="text-right">
						<div class="font-display text-lg font-bold text-leftover-ink">{batch.free} free</div>
						<div class="text-xs text-[#6b4a12]">{planned} planned</div>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</section>
