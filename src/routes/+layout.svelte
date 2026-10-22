<script lang="ts">
	import './layout.css';
	import favicon from '#lib/assets/favicon.svg';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	const nav = [
		{ href: '/plan', label: 'Plan' },
		{ href: '/recipes', label: 'Recipes' },
		{ href: '/grocery', label: 'Grocery list' },
		{ href: '/leftovers', label: 'Leftovers' },
		{ href: '/nutrition', label: 'Nutrition' }
	];
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="flex min-h-screen flex-wrap">
	<nav
		aria-label="Main"
		class="flex-[1_1_220px] border-r border-line bg-white p-5 md:max-w-[240px]"
	>
		<div class="mb-7 font-display text-2xl font-bold text-herb">Meal Planner</div>
		<ul class="flex flex-col gap-1">
			{#each nav as item (item.href)}
				{@const active = page.url.pathname.startsWith(item.href)}
				<li>
					<a
						href={resolve(item.href as '/plan')}
						aria-current={active ? 'page' : undefined}
						class="flex min-h-11 items-center rounded-lg px-3 font-medium {active
							? 'bg-herb-tint text-herb-dark'
							: 'text-muted hover:bg-herb-tint'}"
					>
						{item.label}
					</a>
				</li>
			{/each}
		</ul>
	</nav>
	<main class="min-w-0 flex-[999_1_560px] p-6 md:p-9">
		{@render children()}
	</main>
</div>
