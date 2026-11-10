<script lang="ts">
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import AddDialog from '$lib/components/plan/AddDialog.svelte';
	import DayList from '$lib/components/plan/DayList.svelte';
	import FridgePanel from '$lib/components/plan/FridgePanel.svelte';
	import RecipeShelf from '$lib/components/plan/RecipeShelf.svelte';
	import WeekGrid from '$lib/components/plan/WeekGrid.svelte';
	import { formatServings } from '$lib/domain/format';
	import {
		addDays,
		dayName,
		mondayOf,
		SLOT_LABELS,
		weekLabel,
		type BatchDraw,
		type PlanEntry,
		type Slot
	} from '$lib/domain/plan';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	/** Today in the browser's time zone; the server only knows UTC. */
	let localToday = $state<string | null>(null);
	const today = $derived(localToday ?? data.today);

	let target = $state<{ date: string; slot: Slot } | null>(null);
	let editing = $state<PlanEntry | null>(null);
	let presetRecipeId = $state<string | undefined>();
	let confirming = $state<{ entry: PlanEntry; draws: BatchDraw[] } | null>(null);
	let confirmDialog: HTMLDialogElement;

	const weekHref = (monday: string) => `${resolve('/plan')}?week=${monday}`;

	onMount(() => {
		const now = new Date();
		const local = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
		localToday = local;
		// Without an explicit week the server picked the UTC week; near midnight that can be the wrong one.
		if (!data.explicitWeek && mondayOf(local) !== data.monday) {
			// eslint-disable-next-line svelte/no-navigation-without-resolve -- built from resolve('/plan')
			goto(weekHref(mondayOf(local)), { replaceState: true });
		}
	});

	const bySlot = $derived.by(() => {
		const map: Record<string, PlanEntry[]> = {};
		for (const entry of data.entries) (map[`${entry.date}|${entry.slot}`] ??= []).push(entry);
		return map;
	});
	const entriesIn = (date: string, slot: Slot) => bySlot[`${date}|${slot}`] ?? [];

	const count = (kind: PlanEntry['kind']) => data.entries.filter((e) => e.kind === kind).length;
	const summary = $derived(
		[
			`${count('cook')} ${count('cook') === 1 ? 'cook' : 'cooks'}`,
			`${count('leftover')} leftover ${count('leftover') === 1 ? 'meal' : 'meals'}`,
			`${count('food')} ${count('food') === 1 ? 'food' : 'foods'}`
		].join(' · ')
	);

	const onadd = (date: string, slot: Slot, recipeId?: string) => {
		editing = null;
		presetRecipeId = recipeId;
		target = { date, slot };
	};
	const onedit = (entry: PlanEntry) => {
		target = null;
		editing = entry;
	};
	const onneedsconfirm = (entry: PlanEntry, draws: BatchDraw[]) => {
		confirming = { entry, draws };
		confirmDialog.showModal();
	};

	const where = (date: string, slot: Slot) => `${dayName(date)} ${SLOT_LABELS[slot].toLowerCase()}`;
	const isThisWeek = $derived(mondayOf(today) === data.monday);
</script>

<svelte:head><title>Weekly plan</title></svelte:head>

<div class="flex flex-col gap-6">
	<header class="flex flex-wrap items-center gap-4">
		<div class="flex-[1_1_280px]">
			<h1 class="font-display text-4xl leading-tight font-bold">{weekLabel(data.monday)}</h1>
			<p class="mt-1.5 text-[15px] text-muted">{summary}</p>
		</div>
		<nav aria-label="Weeks" class="flex gap-2">
			<!-- eslint-disable svelte/no-navigation-without-resolve -- built from resolve('/plan') -->
			<a
				class="btn btn-secondary min-h-11 w-11 px-0 text-lg"
				href={weekHref(addDays(data.monday, -7))}
				aria-label="Previous week">‹</a
			>
			<a
				class="btn btn-secondary min-h-11 px-4 font-medium"
				href={weekHref(mondayOf(today))}
				aria-current={isThisWeek ? 'page' : undefined}>This week</a
			>
			<a
				class="btn btn-secondary min-h-11 w-11 px-0 text-lg"
				href={weekHref(addDays(data.monday, 7))}
				aria-label="Next week">›</a
			>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
		</nav>
	</header>

	<div class="hidden flex-wrap gap-4 text-[13px] text-[#3f5247] md:flex" aria-hidden="true">
		<span class="flex items-center gap-2"
			><span class="size-3.5 rounded border border-t-4 border-edge border-t-herb bg-white"
			></span>Cook (makes leftovers)</span
		>
		<span class="flex items-center gap-2"
			><span class="size-3.5 rounded border border-dashed border-leftover bg-leftover-tint"
			></span>Leftover from a cook</span
		>
		<span class="flex items-center gap-2"
			><span class="size-3.5 rounded border border-food-edge bg-food-tint"></span>Food</span
		>
	</div>

	<div class="hidden md:block">
		<WeekGrid days={data.days} {today} {entriesIn} {onadd} {onedit} {onneedsconfirm} />
	</div>
	<div class="md:hidden">
		<DayList days={data.days} {today} {entriesIn} {onadd} {onedit} {onneedsconfirm} />
	</div>

	<div class="flex flex-wrap gap-5">
		<div class="hidden min-w-0 flex-[1_1_380px] md:flex">
			<RecipeShelf recipes={data.recipes} />
		</div>
		<FridgePanel batches={data.batches} />
	</div>
</div>

<AddDialog
	{target}
	{editing}
	{presetRecipeId}
	recipes={data.recipes}
	batches={data.batches}
	onclose={() => {
		target = null;
		editing = null;
		presetRecipeId = undefined;
	}}
/>

<dialog
	bind:this={confirmDialog}
	aria-labelledby="remove-cook-title"
	class="m-auto w-[calc(100%-32px)] max-w-[460px] rounded-2xl bg-white p-7 backdrop:bg-ink/55"
	onclose={() => (confirming = null)}
>
	{#if confirming}
		<form
			method="POST"
			action="?/removeEntry"
			class="flex flex-col gap-4"
			use:enhance={() =>
				async ({ update }) => {
					confirmDialog.close();
					await update();
				}}
		>
			<input type="hidden" name="entryId" value={confirming.entry.id} />
			<input type="hidden" name="confirm" value="1" />
			<h2 id="remove-cook-title" class="font-display text-2xl font-bold">
				Remove {confirming.entry.title}?
			</h2>
			<p class="leading-relaxed text-[#3f5247]">
				These leftovers come from this cook and will be removed too:
			</p>
			<ul class="flex flex-col gap-1.5">
				{#each confirming.draws as draw (draw.entryId)}
					<li class="rounded-lg bg-leftover-tint px-3 py-2 text-sm font-bold text-leftover-ink">
						{where(draw.date, draw.slot)} · {formatServings(draw.servings)}
					</li>
				{/each}
			</ul>
			<div class="flex flex-wrap justify-end gap-3">
				<button type="button" class="btn btn-secondary" onclick={() => confirmDialog.close()}
					>Keep</button
				>
				<button type="submit" class="btn btn-danger">Remove cook and leftovers</button>
			</div>
		</form>
	{/if}
</dialog>
