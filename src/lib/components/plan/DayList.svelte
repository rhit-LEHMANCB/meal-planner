<script lang="ts">
	import SlotCell from './SlotCell.svelte';
	import {
		dayName,
		monthDay,
		SLOT_LABELS,
		SLOTS,
		type BatchDraw,
		type PlanEntry,
		type Slot
	} from '$lib/domain/plan';

	let {
		days,
		today,
		entriesIn,
		onadd,
		onedit,
		onneedsconfirm
	}: {
		days: string[];
		today: string;
		entriesIn: (date: string, slot: Slot) => PlanEntry[];
		onadd: (date: string, slot: Slot, recipeId?: string) => void;
		onedit: (entry: PlanEntry) => void;
		onneedsconfirm: (entry: PlanEntry, draws: BatchDraw[]) => void;
	} = $props();
</script>

<!-- Phones: one card per day with its slots stacked; adding goes through the dialog only. -->
<div class="flex flex-col gap-3">
	{#each days as date (date)}
		<section
			aria-labelledby="day-{date}"
			class="rounded-[14px] bg-white p-3 {date === today
				? 'border-2 border-herb'
				: 'border border-line'}"
		>
			<h2
				id="day-{date}"
				class="mb-2 font-display text-lg font-bold {date === today ? 'text-herb-dark' : ''}"
			>
				{dayName(date)}
				{monthDay(date)}{date === today ? ' · today' : ''}
			</h2>
			<div class="flex flex-col gap-2">
				{#each SLOTS as slot (slot)}
					<div class="flex items-start gap-2.5">
						<div class="w-[70px] flex-none pt-2.5 text-xs font-bold text-muted">
							{SLOT_LABELS[slot]}
						</div>
						<div class="min-w-0 flex-1">
							<SlotCell
								{date}
								{slot}
								where="{dayName(date)} {SLOT_LABELS[slot].toLowerCase()}"
								entries={entriesIn(date, slot)}
								{onadd}
								{onedit}
								{onneedsconfirm}
							/>
						</div>
					</div>
				{/each}
			</div>
		</section>
	{/each}
</div>
