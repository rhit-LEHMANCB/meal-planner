<script lang="ts">
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import GroceryItemRow from '$lib/components/grocery/GroceryItemRow.svelte';
	import { addDays, mondayOf, weekLabel } from '$lib/domain/plan';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	/** Today in the browser's time zone; the server only knows UTC. */
	let localToday = $state<string | null>(null);
	const today = $derived(localToday ?? data.today);
	let adding = $state(false);

	const weekHref = (monday: string) => `${resolve('/grocery')}?week=${monday}`;
	const planHref = $derived(`${resolve('/plan')}?week=${data.monday}`);

	onMount(() => {
		const now = new Date();
		const local = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
		localToday = local;
		// Without an explicit week the server picked the UTC week; near midnight that can be the wrong one.
		if (!data.explicitWeek && mondayOf(local) !== data.monday) {
			// eslint-disable-next-line svelte/no-navigation-without-resolve -- built from resolve('/grocery')
			goto(weekHref(mondayOf(local)), { replaceState: true });
		}
	});

	const isThisWeek = $derived(mondayOf(today) === data.monday);
	const view = $derived(data.view);
	const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
	const covers = $derived(
		`Covers ${plural(view.cooks, 'cook', 'cooks')} and ${plural(view.foods, 'food', 'foods')}`
	);
	const progress = $derived(view.total ? Math.round((view.done / view.total) * 100) : 0);
	const progressText = $derived(`${view.done} of ${view.total} in the cart`);
	const errors = $derived(
		(form && 'errors' in form ? form.errors : {}) as Record<string, string | undefined>
	);
	const addError = $derived(form?.action === 'add' ? errors.text : undefined);
	/** Errors no field shows: an item that has gone, or a bad request from a tick or the menu. */
	const formError = $derived(
		errors.form ?? (form?.action !== 'add' ? Object.values(errors).find(Boolean) : undefined)
	);
</script>

<svelte:head><title>Grocery list</title></svelte:head>

<div class="flex flex-col gap-6">
	<header class="flex flex-wrap items-center gap-4">
		<div class="flex-[1_1_280px]">
			<h1 class="font-display text-4xl leading-tight font-bold">Grocery list</h1>
			<p class="mt-1.5 text-[15px] text-muted">
				<span class="font-bold text-[#3f5247]">{weekLabel(data.monday)}</span>
				· {covers} · leftovers add nothing ·
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- built from resolve('/plan') -->
				<a href={planHref} class="font-bold text-herb">Open the plan</a>
			</p>
		</div>
		<nav aria-label="Weeks" class="flex gap-2">
			<!-- eslint-disable svelte/no-navigation-without-resolve -- built from resolve('/grocery') -->
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

	<div class="flex flex-wrap items-center gap-5 rounded-2xl border border-line bg-white px-5 py-4">
		{#if view.total > 0}
			<div class="flex flex-[1_1_240px] flex-col gap-1.5">
				<div class="text-sm text-[#3f5247]" data-testid="grocery-progress">{progressText}</div>
				<div
					class="h-2 rounded bg-[#e3e9df]"
					role="progressbar"
					aria-label="In the cart"
					aria-valuemin={0}
					aria-valuemax={view.total}
					aria-valuenow={view.done}
				>
					<div class="h-2 rounded bg-herb" style="width: {progress}%"></div>
				</div>
			</div>
		{/if}
		<form
			method="POST"
			action="?week={data.monday}&/add"
			class="flex flex-[2_1_320px] flex-col gap-1.5"
			use:enhance={() => {
				adding = true;
				return async ({ update }) => {
					await update();
					adding = false;
				};
			}}
		>
			<input type="hidden" name="week" value={data.monday} />
			<div class="flex gap-2">
				<label for="add-item" class="sr-only">Add an item</label>
				<input
					id="add-item"
					name="text"
					type="text"
					maxlength="200"
					autocomplete="off"
					placeholder="Add an item, e.g. 2 paper towels"
					class="input min-h-11 min-w-0 flex-1"
					aria-invalid={addError ? 'true' : undefined}
					aria-describedby={addError ? 'add-item-error' : undefined}
				/>
				<button type="submit" class="btn btn-primary min-h-11 px-4" disabled={adding}>Add</button>
			</div>
			{#if addError}
				<p id="add-item-error" class="field-error">{addError}</p>
			{/if}
		</form>
	</div>

	{#if formError}
		<p class="notice notice-error" role="alert">{formError}</p>
	{/if}

	{#if view.empty}
		<section
			aria-labelledby="empty-title"
			class="flex flex-wrap items-center gap-4 rounded-2xl border border-dashed border-[#aeb9ab] bg-white p-7"
		>
			<div class="flex-[1_1_320px]">
				<h2 id="empty-title" class="font-display text-[22px] font-bold">Nothing to buy yet</h2>
				<p class="mt-1 text-sm text-muted">
					Plan some cooks or foods for this week and they show up here. You can still add your own
					items above.
				</p>
			</div>
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- built from resolve('/plan') -->
			<a href={planHref} class="btn btn-primary min-h-11">Plan this week</a>
		</section>
	{:else}
		<div class="grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] items-start gap-5">
			{#each view.sections as section (section.aisle)}
				<section
					aria-label={section.aisle}
					class="rounded-2xl border border-line bg-white px-5 pt-4 pb-2"
				>
					<h2 class="mb-1 text-xs font-bold tracking-[0.08em] text-muted uppercase">
						{section.aisle}
					</h2>
					<ul>
						{#each section.items as item (item.id)}
							<GroceryItemRow {item} week={data.monday} />
						{/each}
					</ul>
				</section>
			{/each}
		</div>
		<p class="notice notice-ok">
			Amounts cover every serving cooked this week. Leftover meals add nothing here.
		</p>
	{/if}
</div>
