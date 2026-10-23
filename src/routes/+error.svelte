<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
</script>

<svelte:head
	><title>{page.status === 404 ? 'Not found' : 'Something went wrong'}</title></svelte:head
>

<div class="flex min-h-[50vh] flex-col items-start justify-center gap-3 p-6">
	<p class="text-sm font-bold text-muted">{page.status}</p>
	<h1 class="font-display text-3xl font-bold">
		{page.status === 404 ? 'We could not find that' : 'Something went wrong'}
	</h1>
	<p class="text-muted">{page.error?.message}</p>
	<a class="btn btn-primary min-h-11" href={resolve('/recipes')}>Back to recipes</a>
</div>
