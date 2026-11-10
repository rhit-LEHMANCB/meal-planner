<script lang="ts">
	import { enhance } from '$app/forms';
	import { formatServings } from '$lib/domain/format';
	import { formatAmount } from '$lib/domain/ingredient-line';
	import { dayName, type BatchDraw, type PlanEntry } from '$lib/domain/plan';

	let {
		entry,
		where,
		onedit,
		onneedsconfirm
	}: {
		entry: PlanEntry;
		/** "Tue dinner", for button labels. */
		where: string;
		onedit: (entry: PlanEntry) => void;
		/** A cook with planned leftovers needs a confirmation before it can be removed. */
		onneedsconfirm: (entry: PlanEntry, draws: BatchDraw[]) => void;
	} = $props();

	let busy = $state(false);

	const detail = $derived(
		entry.kind === 'cook'
			? `cook ${entry.cooked} · eat ${entry.servings}`
			: entry.kind === 'leftover'
				? formatServings(entry.servings)
				: `${formatAmount(entry.amount ?? 0)} ${entry.unit ?? ''}`
	);

	const styles = {
		cook: 'border border-edge border-t-4 border-t-herb bg-white',
		leftover: 'border border-dashed border-leftover bg-leftover-tint text-leftover-ink',
		food: 'border border-food-edge bg-food-tint text-food-ink'
	};
</script>

<div
	class="relative rounded-[10px] {styles[entry.kind]}"
	data-testid="plan-entry"
	data-kind={entry.kind}
>
	<button
		type="button"
		class="flex w-full cursor-pointer flex-col gap-0.5 rounded-[10px] py-2 pr-9 pl-2.5 text-left"
		aria-label="Edit {entry.kind === 'leftover' ? 'leftover ' : ''}{entry.title}, {where}"
		onclick={() => onedit(entry)}
	>
		{#if entry.kind === 'leftover'}
			<span class="text-[11px] font-bold tracking-wider text-[#7a4a06] uppercase">Leftover</span>
		{/if}
		<span class="text-[13px] leading-tight font-bold">{entry.title}</span>
		<span
			class="text-xs {entry.kind === 'food'
				? 'text-food-muted'
				: entry.kind === 'leftover'
					? 'text-[#6b4a12]'
					: 'text-muted'}">{detail}</span
		>
		{#if entry.gone}
			<span class="mt-1 text-xs font-bold text-danger-ink">Thrown out</span>
		{:else if entry.pastEatBy && entry.eatBy}
			<span class="mt-1 flex items-center gap-1 text-xs font-bold text-danger-ink">
				<svg
					width="14"
					height="14"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"><path d="M12 3 2 21h20zM12 10v5M12 18h.01" /></svg
				>
				Past eat-by ({dayName(entry.eatBy)})
			</span>
		{/if}
	</button>
	<form
		method="POST"
		action="?/removeEntry"
		class="absolute top-1 right-0.5"
		use:enhance={() => {
			busy = true;
			return async ({ result, update }) => {
				busy = false;
				if (result.type === 'failure' && Array.isArray(result.data?.draws)) {
					onneedsconfirm(entry, result.data.draws as BatchDraw[]);
					return;
				}
				await update();
			};
		}}
	>
		<input type="hidden" name="entryId" value={entry.id} />
		<button
			type="submit"
			disabled={busy}
			class="grid size-7 cursor-pointer place-items-center rounded-lg text-base text-muted hover:bg-black/5"
			aria-label="Remove {entry.kind === 'leftover' ? 'leftover ' : ''}{entry.title}, {where}"
			>×</button
		>
	</form>
</div>
