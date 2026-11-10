<script lang="ts">
	import { resolve } from '$app/paths';

	let {
		pathname,
		email
	}: {
		/** The current path, to mark the active link. */
		pathname: string;
		email: string | null | undefined;
	} = $props();

	let menu = $state<HTMLDivElement>();

	const links = [
		{ href: '/plan', label: 'Plan' },
		{ href: '/recipes', label: 'Recipes' },
		{ href: '/grocery', label: 'Grocery list' },
		{ href: '/leftovers', label: 'Leftovers' },
		{ href: '/nutrition', label: 'Nutrition' }
	] as const;

	const items = $derived(
		links.map((link) => ({ ...link, active: pathname.startsWith(link.href) }))
	);

	/** Client-side navigation keeps the page, so the phone menu has to be closed by hand. */
	const closeMenu = () => {
		if (menu?.matches(':popover-open')) menu.hidePopover();
	};
</script>

{#snippet navLinks(onclick?: () => void)}
	<ul class="flex flex-col gap-1">
		{#each items as item (item.href)}
			<li>
				<a
					href={resolve(item.href)}
					aria-current={item.active ? 'page' : undefined}
					{onclick}
					class="flex min-h-11 items-center rounded-lg px-3 font-medium {item.active
						? 'bg-herb-tint text-herb-dark'
						: 'text-muted hover:bg-herb-tint'}"
				>
					{item.label}
				</a>
			</li>
		{/each}
	</ul>
{/snippet}

{#snippet account()}
	<div class="flex flex-col gap-2 text-[13px] text-muted">
		{#if email}<span class="break-all">{email}</span>{/if}
		<form method="POST" action={resolve('/signout')}>
			<button class="btn btn-secondary min-h-11 px-4 text-sm" type="submit">Sign out</button>
		</form>
	</div>
{/snippet}

<!-- Phones: a top bar whose Menu button opens the links as a sheet (a native popover, so it also
     works without JavaScript and closes with Escape or a tap outside). -->
<header
	class="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-white px-4 py-2 md:hidden"
>
	<a href={resolve('/plan')} class="flex-1 font-display text-xl font-bold text-herb">Meal Planner</a
	>
	<button
		type="button"
		popovertarget="main-menu"
		class="btn btn-secondary min-h-11 gap-2 px-3 text-sm"
	>
		<svg
			width="20"
			height="20"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg
		>
		Menu
	</button>
</header>
<div
	bind:this={menu}
	id="main-menu"
	popover="auto"
	class="main-menu m-0 w-full max-w-none border-b border-line bg-white px-4 pt-3 pb-5 shadow-xl backdrop:bg-ink/45 md:hidden"
>
	<nav aria-label="Main" class="flex flex-col gap-5">
		<div class="flex items-center gap-3">
			<span class="flex-1 font-display text-xl font-bold text-herb">Meal Planner</span>
			<button
				type="button"
				popovertarget="main-menu"
				popovertargetaction="hide"
				class="grid size-11 cursor-pointer place-items-center rounded-[10px] bg-ground text-xl"
				aria-label="Close menu">×</button
			>
		</div>
		{@render navLinks(closeMenu)}
		{@render account()}
	</nav>
</div>

<!-- md and up: a sidebar that stays at screen height while the page scrolls. -->
<nav
	aria-label="Main"
	class="hidden w-[240px] shrink-0 flex-col gap-7 self-start border-r border-line bg-white p-5 md:sticky md:top-0 md:flex md:h-screen md:overflow-y-auto"
>
	<div class="font-display text-2xl font-bold text-herb">Meal Planner</div>
	{@render navLinks()}
	<div class="mt-auto">{@render account()}</div>
</nav>

<style>
	/* The phone menu drops down from the top of the screen. */
	.main-menu:popover-open {
		position: fixed;
		inset: 0 0 auto 0;
	}
</style>
