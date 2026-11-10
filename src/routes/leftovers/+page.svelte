<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { formatServings } from '$lib/domain/format';
	import {
		dayName,
		isPastEatBy,
		monthDay,
		SLOT_LABELS,
		todayIso,
		type Batch
	} from '$lib/domain/plan';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let confirming = $state<Batch | null>(null);
	let dialog: HTMLDialogElement;

	const day = (iso: string) => `${dayName(iso)} ${monthDay(iso)}`;
	const today = todayIso();
</script>

<svelte:head><title>Leftovers</title></svelte:head>

<div class="flex max-w-[980px] flex-col gap-6">
	<header>
		<h1 class="font-display text-4xl font-bold">Leftovers</h1>
		<p class="mt-1.5 text-[15px] text-muted">
			Batches you planned to cook, and the servings still free to plan. Cook a recipe on the
			<a class="font-bold text-herb" href={resolve('/plan')}>weekly plan</a> to add one.
		</p>
	</header>

	{#if form?.error}
		<div role="alert" class="notice notice-error">{form.error}</div>
	{/if}

	<section aria-labelledby="fridge-h" class="flex flex-col gap-3">
		<h2 id="fridge-h" class="font-display text-xl font-bold">In the fridge</h2>
		{#if data.fridge.length === 0}
			<p class="card p-5 text-sm text-muted">
				No leftovers yet. Plan a cook on the <a class="font-bold text-herb" href={resolve('/plan')}
					>weekly plan</a
				> with more servings than you eat.
			</p>
		{/if}
		{#each data.fridge as batch (batch.id)}
			{@const past = batch.free > 0 && isPastEatBy(batch.eatBy, today)}
			<article
				class="card flex flex-wrap items-start gap-4 px-5 py-[18px]"
				aria-labelledby="batch-{batch.id}"
				data-testid="leftover-batch"
			>
				<div class="flex min-w-0 flex-[1_1_320px] flex-col gap-1.5">
					<div class="flex flex-wrap items-center gap-2.5">
						<h3 id="batch-{batch.id}" class="text-lg font-bold">
							<a href={resolve('/recipes/[id]', { id: batch.recipeId })}>{batch.title}</a>
						</h3>
						{#if past}
							<span
								class="rounded-full bg-danger-tint px-2.5 py-0.5 text-xs font-bold text-danger-ink"
								>Past eat-by</span
							>
						{/if}
					</div>
					<p class="text-sm text-muted">
						Cooked {day(batch.cookedOn)}{batch.cookSlot
							? `, ${SLOT_LABELS[batch.cookSlot].toLowerCase()}`
							: ''}{batch.eatBy ? ` · eat by ${day(batch.eatBy)}` : ''} · cooked {batch.cooked},
						eaten {batch.eaten}
					</p>
					{#if batch.draws.length > 0}
						<ul class="mt-1 flex flex-wrap gap-1.5" aria-label="Planned leftovers">
							{#each batch.draws as draw (draw.entryId)}
								<li
									class="rounded-full px-2.5 py-1 text-xs font-bold {draw.pastEatBy
										? 'bg-danger-tint text-danger-ink'
										: 'bg-leftover-tint text-[#6b4a12]'}"
								>
									{dayName(draw.date)}
									{SLOT_LABELS[draw.slot].toLowerCase()} · {draw.servings}{draw.pastEatBy
										? ' · past eat-by'
										: ''}
								</li>
							{/each}
						</ul>
					{/if}
				</div>
				<div class="flex flex-none items-center gap-4">
					<div class="text-right">
						<div class="font-display text-[26px] font-bold text-leftover-ink">{batch.free}</div>
						<div class="text-xs text-[#6b4a12]">free of {batch.spare} spare</div>
					</div>
					<button
						type="button"
						class="btn btn-secondary min-h-11 px-4"
						aria-label="Throw out {batch.title}"
						onclick={() => {
							confirming = batch;
							dialog.showModal();
						}}>Throw out</button
					>
				</div>
			</article>
		{/each}
	</section>

	{#if data.gone.length > 0}
		<section aria-labelledby="gone-h" class="flex flex-col gap-2.5">
			<h2 id="gone-h" class="font-display text-xl font-bold">
				Finished or thrown out (last 2 weeks)
			</h2>
			<ul class="flex flex-col gap-2.5">
				{#each data.gone as batch (batch.id)}
					<li
						class="flex flex-wrap gap-x-4 gap-y-2 rounded-xl bg-[#eef1ea] px-4 py-3 text-sm text-[#3f5247]"
					>
						<span class="font-bold text-ink">{batch.title}</span>
						<span>Cooked {day(batch.cookedOn)}</span>
						<span>
							{batch.state === 'thrown_out'
								? `Thrown out ${batch.leftOn ? day(batch.leftOn) : ''}`
								: `Finished: all ${formatServings(batch.spare)} planned`}
						</span>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</div>

<dialog
	bind:this={dialog}
	aria-labelledby="throw-title"
	class="m-auto w-[calc(100%-32px)] max-w-[440px] rounded-2xl bg-white p-7 backdrop:bg-ink/55"
	onclose={() => (confirming = null)}
>
	{#if confirming}
		<form
			method="POST"
			action="?/throwOut"
			class="flex flex-col gap-4"
			use:enhance={() =>
				async ({ update }) => {
					dialog.close();
					await update();
				}}
		>
			<input type="hidden" name="batchId" value={confirming.id} />
			<h2 id="throw-title" class="font-display text-2xl font-bold">
				Throw out {confirming.title}?
			</h2>
			<p class="leading-relaxed text-[#3f5247]">
				No servings will be left to plan.{confirming.draws.length > 0
					? ' Leftovers already on the plan stay there and show as thrown out.'
					: ''}
			</p>
			<div class="flex flex-wrap justify-end gap-3">
				<button type="button" class="btn btn-secondary" onclick={() => dialog.close()}>Keep</button>
				<button type="submit" class="btn btn-danger">Throw out</button>
			</div>
		</form>
	{/if}
</dialog>
