<script lang="ts">
	import { formatKcal } from '$lib/domain/format';

	let {
		total,
		inverse = false
	}: {
		/** The day's planned calories, or null/undefined when nothing is planned. */
		total: { kcal: number; partial: boolean } | null | undefined;
		/** Light text, for the highlighted (today) header. */
		inverse?: boolean;
	} = $props();
</script>

{#if total}
	<div
		class="text-xs font-medium {inverse ? 'text-white' : 'text-muted'}"
		data-day-kcal={Math.round(total.kcal)}
		data-partial={total.partial ? 'true' : undefined}
	>
		{`${formatKcal(total.kcal)} kcal`}{#if total.partial}<span
				title="Some ingredients or entries have no nutrition">&nbsp;· partial</span
			>{/if}
	</div>
{/if}
