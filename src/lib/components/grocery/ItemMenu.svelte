<script lang="ts">
	import { enhance } from '$app/forms';
	import { AISLES } from '$lib/domain/aisles';
	import type { ViewItem } from '$lib/domain/grocery-view';

	let {
		item,
		week,
		id
	}: {
		item: ViewItem;
		week: string;
		/** The popover's id, which the row's "⋯" button targets. */
		id: string;
	} = $props();

	let menu: HTMLDivElement;
	let busy = $state(false);

	const titleId = $derived(`${id}-title`);
	const detail = $derived(
		[item.amount, item.extra ? 'added by you' : `for ${item.forText}`].filter(Boolean).join(' · ')
	);
	const aisleOptions = $derived(AISLES.map((aisle) => ({ aisle, current: aisle === item.aisle })));

	/** Closes the menu once the action has gone through. */
	const closeAfter = () => {
		busy = true;
		return async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => {
			await update({ reset: false });
			busy = false;
			menu?.hidePopover?.();
		};
	};
</script>

<div
	bind:this={menu}
	{id}
	popover="auto"
	role="dialog"
	aria-labelledby={titleId}
	class="item-menu m-0 w-full max-w-none rounded-t-[20px] bg-white px-5 pt-4 pb-6 text-ink shadow-xl backdrop:bg-ink/45 sm:m-auto sm:max-w-md sm:rounded-[20px]"
>
	<div class="flex flex-col gap-4">
		<div class="flex items-start gap-3">
			<div class="min-w-0 flex-1">
				<h2 id={titleId} class="font-display text-[22px] font-bold break-words">{item.name}</h2>
				<p class="mt-1 text-[13px] text-muted">{detail}</p>
			</div>
			<button
				type="button"
				popovertarget={id}
				popovertargetaction="hide"
				class="grid size-11 cursor-pointer place-items-center rounded-[10px] bg-ground text-xl"
				aria-label="Close">×</button
			>
		</div>

		<form
			method="POST"
			action="?week={week}&/aisle"
			class="flex flex-col gap-3"
			use:enhance={closeAfter}
		>
			<input type="hidden" name="week" value={week} />
			<input type="hidden" name="key" value={item.key} />
			<fieldset class="flex flex-col">
				<legend class="pb-1.5 text-[13px] font-bold text-[#3f5247]">Move to aisle</legend>
				{#each aisleOptions as option (option.aisle)}
					<label class="flex min-h-11 items-center gap-3 border-b border-[#eef2eb] text-[15px]">
						<input
							type="radio"
							name="aisle"
							value={option.aisle}
							checked={option.current}
							class="size-5 accent-herb"
						/>
						<span>{option.aisle}</span>
					</label>
				{/each}
			</fieldset>
			<p class="notice notice-ok py-2.5 text-[13px]">
				Your choice is remembered for every list with this item.
			</p>
			<button type="submit" class="btn btn-primary" disabled={busy}>Move</button>
		</form>

		{#if item.extra}
			<form method="POST" action="?week={week}&/remove" use:enhance={closeAfter}>
				<input type="hidden" name="week" value={week} />
				<input type="hidden" name="id" value={item.id} />
				<button type="submit" class="btn btn-danger w-full" disabled={busy}>Delete item</button>
			</form>
		{/if}
	</div>
</div>

<style>
	/* A bottom sheet on phones, a centred panel from the sm breakpoint up. */
	.item-menu:popover-open {
		position: fixed;
		inset: auto 0 0 0;
	}
	@media (min-width: 640px) {
		.item-menu:popover-open {
			inset: 0;
		}
	}
</style>
