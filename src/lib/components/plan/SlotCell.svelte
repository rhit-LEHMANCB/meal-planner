<script lang="ts">
	import SlotEntry from './SlotEntry.svelte';
	import { RECIPE_DRAG_TYPE, type BatchDraw, type PlanEntry, type Slot } from '$lib/domain/plan';

	let {
		date,
		slot,
		where,
		entries,
		droppable = false,
		onadd,
		onedit,
		onneedsconfirm
	}: {
		date: string;
		slot: Slot;
		/** "Tue dinner" */
		where: string;
		entries: PlanEntry[];
		/** Accepts recipes dragged from the shelf (wide screens only). */
		droppable?: boolean;
		onadd: (date: string, slot: Slot, recipeId?: string) => void;
		onedit: (entry: PlanEntry) => void;
		onneedsconfirm: (entry: PlanEntry, draws: BatchDraw[]) => void;
	} = $props();

	let over = $state(false);

	const accepts = (event: DragEvent) =>
		droppable && (event.dataTransfer?.types.includes(RECIPE_DRAG_TYPE) ?? false);
</script>

<div
	role="group"
	aria-label={where}
	data-slot="{date}-{slot}"
	class="flex h-full min-h-24 flex-col gap-1.5 rounded-xl p-1 {over
		? 'bg-herb-tint outline-2 outline-herb outline-dashed'
		: ''}"
	ondragover={(event) => {
		if (!accepts(event)) return;
		event.preventDefault();
		over = true;
	}}
	ondragleave={() => (over = false)}
	ondrop={(event) => {
		over = false;
		if (!accepts(event)) return;
		event.preventDefault();
		const recipeId = event.dataTransfer?.getData(RECIPE_DRAG_TYPE);
		if (recipeId) onadd(date, slot, recipeId);
	}}
>
	{#each entries as entry (entry.id)}
		<SlotEntry {entry} {where} {onedit} {onneedsconfirm} />
	{/each}
	<button
		type="button"
		class="cursor-pointer rounded-[10px] border border-dashed border-[#aeb9ab] text-[13px] text-muted hover:bg-herb-tint {entries.length
			? 'min-h-9'
			: 'min-h-11 flex-1'}"
		aria-label="Add to {where}"
		onclick={() => onadd(date, slot)}>+ Add</button
	>
</div>
