<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/state';
	import MainNav from '$lib/components/MainNav.svelte';
	import { isAuthPage } from '$lib/domain/paths';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	// Lets browser tests wait until the server-rendered page is interactive (typing earlier is overwritten).
	$effect(() => {
		document.documentElement.dataset.hydrated = 'true';
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{#if isAuthPage(page.url.pathname)}
	{@render children()}
{:else}
	<!-- Phones: a top bar with a Menu button. md and up: the sidebar beside the page. -->
	<div class="flex min-h-screen flex-col md:flex-row">
		<MainNav pathname={page.url.pathname} email={data.email} />
		<main class="min-w-0 flex-1 p-4 sm:p-6 md:p-9">
			{@render children()}
		</main>
	</div>
{/if}
