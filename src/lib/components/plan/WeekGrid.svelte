<script lang="ts">
	import SlotCell from './SlotCell.svelte';
	import {
		dayName,
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

<!-- Wide screens: seven columns of four slots. Phones get DayList instead. -->
<section aria-label="Week grid" class="card overflow-x-auto p-4">
	<div class="grid min-w-[1000px] grid-cols-[84px_repeat(7,minmax(0,1fr))] gap-2">
		<div></div>
		{#each days as date (date)}
			<div
				class="rounded-[10px] px-2 py-2.5 text-center {date === today
					? 'bg-herb text-white'
					: 'bg-herb-tint text-herb-dark'}"
				aria-current={date === today ? 'date' : undefined}
			>
				<div class="text-xs font-bold tracking-wider uppercase">{dayName(date)}</div>
				<div class="font-display text-xl font-bold">{Number(date.slice(8))}</div>
			</div>
		{/each}
		{#each SLOTS as slot (slot)}
			<div class="pt-2.5 text-[13px] font-bold text-muted">{SLOT_LABELS[slot]}</div>
			{#each days as date (date)}
				<SlotCell
					{date}
					{slot}
					where="{dayName(date)} {SLOT_LABELS[slot].toLowerCase()}"
					entries={entriesIn(date, slot)}
					droppable
					{onadd}
					{onedit}
					{onneedsconfirm}
				/>
			{/each}
		{/each}
	</div>
</section>
