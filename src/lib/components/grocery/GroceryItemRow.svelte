<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ViewItem } from '$lib/domain/grocery-view';
	import ItemMenu from './ItemMenu.svelte';

	let {
		item,
		week
	}: {
		item: ViewItem;
		/** The week's Monday, sent with every action. */
		week: string;
	} = $props();

	let busy = $state(false);

	/** A DOM id unique per item: the key's code points, so "half and half" and "half-and-half" differ. */
	const menuId = $derived(
		`item-menu-${item.extra ? 'x' : 'k'}-${[...item.id].map((c) => c.codePointAt(0)?.toString(36)).join('_')}`
	);
	const nameClass = $derived(item.checked ? 'text-muted line-through' : 'text-ink');
	const amountClass = $derived(item.checked ? 'text-muted' : 'text-ink');
</script>

<li class="flex items-center gap-1 border-b border-[#e3e9df]" data-testid="grocery-item">
	<form
		method="POST"
		action="?week={week}&/{item.extra ? 'extraTick' : 'tick'}"
		class="min-w-0 flex-1"
		use:enhance={() => {
			busy = true;
			return async ({ update }) => {
				await update({ reset: false });
				busy = false;
			};
		}}
	>
		<input type="hidden" name="week" value={week} />
		{#if item.extra}
			<input type="hidden" name="id" value={item.id} />
		{:else}
			<input type="hidden" name="key" value={item.key} />
		{/if}
		<input type="hidden" name="checked" value={item.checked ? 'false' : 'true'} />
		<button
			type="submit"
			disabled={busy}
			aria-pressed={item.checked}
			class="flex min-h-14 w-full cursor-pointer items-center gap-3.5 py-1.5 text-left disabled:cursor-wait"
		>
			<span
				class="grid size-6 shrink-0 place-items-center rounded-md border-2 {item.checked
					? 'border-herb bg-herb text-white'
					: 'border-edge bg-white'}"
				aria-hidden="true"
			>
				{#if item.checked}
					<svg
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="3"
						stroke-linecap="round"
						stroke-linejoin="round"><path d="m5 12 5 5 9-10" /></svg
					>
				{/if}
			</span>
			<span class="flex min-w-0 flex-1 flex-col gap-0.5">
				<span class="text-base font-medium break-words {nameClass}">{item.name}</span>
				<span class="text-xs text-muted">{item.forText}</span>
				{#if item.moreNeeded}
					<span
						class="mt-0.5 self-start rounded-full bg-leftover-tint px-2 py-0.5 text-[11px] font-bold text-[#7a4a06]"
						>More needed since you ticked it</span
					>
				{/if}
			</span>
			{#if item.amount}
				<span class="text-right text-sm font-bold {amountClass}">{item.amount}</span>
			{/if}
		</button>
	</form>
	<button
		type="button"
		popovertarget={menuId}
		class="grid size-11 shrink-0 cursor-pointer place-items-center rounded-[10px] text-xl leading-none text-muted hover:bg-black/5"
		aria-label="More for {item.name}">⋯</button
	>
	<ItemMenu {item} {week} id={menuId} />
</li>
