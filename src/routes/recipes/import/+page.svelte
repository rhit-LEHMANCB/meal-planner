<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import RecipeForm from '$lib/components/RecipeForm.svelte';
	import { shrinkPhoto } from '$lib/photo-resize';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let busy = $state(false);
	/** True while a chosen photo is being shrunk; the photo cannot be sent until it is done. */
	let preparing = $state(false);

	const review = $derived(form && 'review' in form ? form.review : null);
	const failure = $derived(form && 'reason' in form ? form : null);
	/** A blocked link switches to pasted text and keeps the link as the source. */
	const carriedLink = $derived(
		failure?.reason === 'link-unreadable' ? failure.link : (failure?.sourceUrl ?? '')
	);
	const source = $derived(
		failure?.reason === 'link-unreadable' ? 'text' : (failure?.source ?? data.source)
	);

	const SOURCES = [
		{ id: 'link', label: 'Link' },
		{ id: 'text', label: 'Paste text' },
		{ id: 'photo', label: 'Photo' }
	] as const;

	const steps = $derived([
		{ n: 1, label: 'Source', state: review ? 'done' : 'current' },
		{ n: 2, label: 'Review', state: review ? 'current' : 'todo' },
		{ n: 3, label: 'Save', state: 'todo' }
	]);

	const submitting = () => {
		busy = true;
		return async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => {
			await update({ reset: false });
			busy = false;
		};
	};

	/** Replaces a large photo with a smaller JPEG before it is uploaded. */
	const onPhoto = async (event: Event) => {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		preparing = true;
		try {
			const smaller = await shrinkPhoto(file);
			if (smaller !== file) {
				const transfer = new DataTransfer();
				transfer.items.add(smaller);
				input.files = transfer.files;
			}
		} finally {
			preparing = false;
		}
	};

	const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

	const droppedNotice = $derived.by(() => {
		const dropped = review ? review.info.droppedIngredients + review.info.droppedSteps : 0;
		if (dropped === 0) return null;
		return dropped === 1
			? '1 line could not be read and was left out.'
			: `${dropped} lines could not be read and were left out.`;
	});
</script>

<svelte:head><title>{review ? 'Review imported recipe' : 'Import a recipe'}</title></svelte:head>

<div class="flex flex-col gap-6">
	<header class="flex flex-wrap items-center gap-x-8 gap-y-4">
		<div class="flex-[1_1_320px]">
			<a class="text-sm font-medium text-herb" href={resolve('/recipes')}>‹ Back to recipes</a>
			<h1 class="mt-2 font-display text-4xl leading-tight font-bold">
				{review ? 'Review imported recipe' : 'Import a recipe'}
			</h1>
		</div>
		<ol class="flex flex-wrap gap-3 text-sm font-medium" aria-label="Import steps">
			{#each steps as step (step.n)}
				<li
					class="flex items-center gap-2 {step.state === 'current' ? 'text-ink' : 'text-muted'}"
					aria-current={step.state === 'current' ? 'step' : undefined}
				>
					<span
						class="inline-flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-bold {step.state ===
						'current'
							? 'bg-herb text-white'
							: step.state === 'done'
								? 'bg-[#dcebdd] text-herb-dark'
								: 'bg-[#e3e9df] text-muted'}">{step.n}</span
					>{step.label}
				</li>
			{/each}
		</ol>
	</header>

	<div class="flex flex-wrap items-start gap-6">
		<aside
			aria-label="Source"
			class="card flex min-w-0 flex-col gap-4 p-5 {review
				? 'max-w-[380px] flex-[1_1_300px]'
				: 'max-w-[720px] flex-[1_1_100%]'}"
		>
			<h2 class="font-display text-lg font-bold">Source</h2>

			{#if review}
				<div class="flex flex-col gap-2.5 text-[13px] leading-snug" role="status">
					{#if review.info.via === 'structured'}
						<div class="notice notice-ok">
							<strong>Structured data found.</strong> The recipe was read directly from the page, without
							AI.
						</div>
					{:else if review.info.via === 'ai'}
						<div class="notice {review.info.needsCheck > 0 ? 'notice-warn' : 'notice-ok'}">
							<strong
								>AI parsed {plural(
									review.info.ingredientCount,
									'ingredient line',
									'ingredient lines'
								)}.</strong
							>
							{#if review.info.needsCheck > 0}
								{plural(review.info.needsCheck, 'needs', 'need')} a second look.
							{/if}
						</div>
					{/if}
					{#if review.info.truncated}
						<div class="notice notice-warn">
							The recipe was too long to read completely. Check the end of the ingredients and
							steps.
						</div>
					{/if}
					{#if droppedNotice}
						<div class="notice notice-warn">{droppedNotice}</div>
					{/if}
					{#if review.values.servings === ''}
						<div class="notice notice-warn">
							The source does not say how many servings. Add them before saving.
						</div>
					{/if}
				</div>
				<p class="text-sm text-muted">Nothing is saved until you choose Save to recipe shelf.</p>
				<div class="flex flex-wrap gap-2">
					<a
						class="btn btn-secondary min-h-11 px-4 text-sm font-medium"
						href="{resolve('/recipes/import')}?source=text">Paste text instead</a
					>
					<a
						class="btn btn-secondary min-h-11 px-4 text-sm font-medium"
						href="{resolve('/recipes/import')}?source=photo">Upload photo</a
					>
				</div>
			{:else}
				<nav aria-label="Import from" class="flex flex-wrap gap-2">
					{#each SOURCES as s (s.id)}
						<a
							class="btn min-h-11 px-4 text-sm {source === s.id
								? 'btn-primary'
								: 'btn-secondary font-medium'}"
							href="{resolve('/recipes/import')}?source={s.id}"
							aria-current={source === s.id ? 'page' : undefined}>{s.label}</a
						>
					{/each}
				</nav>

				<p class="hint" data-testid="ai-left">
					{data.aiLeft} of {data.dailyLimit} AI imports left today. Links to pages with recipe data do
					not use one.
				</p>

				{#if failure}
					<div
						role="alert"
						class="notice {failure.reason === 'link-unreadable' ? 'notice-warn' : 'notice-error'}"
					>
						{failure.message}
						{#if failure.reason === 'no-recipe'}
							<a class="font-bold text-herb" href={resolve('/recipes/new')}>Add it by hand</a>
						{/if}
					</div>
				{/if}

				{#if source === 'link'}
					<form method="POST" action="?/link" class="flex flex-col gap-3" use:enhance={submitting}>
						<div class="flex flex-col gap-1.5">
							<label class="label" for="link">Recipe link</label>
							<input
								id="link"
								name="link"
								class="input"
								type="url"
								inputmode="url"
								placeholder="https://"
								required
								value={failure?.link ?? ''}
							/>
						</div>
						<div>
							<button class="btn btn-primary" type="submit" disabled={busy}>
								{busy ? 'Importing…' : 'Import link'}
							</button>
						</div>
					</form>
				{:else if source === 'text'}
					<form method="POST" action="?/text" class="flex flex-col gap-3" use:enhance={submitting}>
						{#if carriedLink}
							<input type="hidden" name="sourceUrl" value={carriedLink} />
							<p class="hint">The link will be kept as the recipe's source: {carriedLink}</p>
						{/if}
						<div class="flex flex-col gap-1.5">
							<label class="label" for="text">Recipe text</label>
							<textarea
								id="text"
								name="text"
								class="input py-3 leading-normal"
								rows="12"
								maxlength="20000"
								aria-describedby="text-help">{failure?.text ?? ''}</textarea
							>
							<span id="text-help" class="hint"
								>Paste the whole recipe: title, ingredients and steps. Up to 20,000 characters.</span
							>
						</div>
						<div>
							<button class="btn btn-primary" type="submit" disabled={busy}>
								{busy ? 'Importing…' : 'Import text'}
							</button>
						</div>
					</form>
				{:else}
					<form
						method="POST"
						action="?/photo"
						enctype="multipart/form-data"
						class="flex flex-col gap-3"
						use:enhance={submitting}
					>
						<div class="flex flex-col gap-1.5">
							<label class="label" for="photo">Photo of the recipe</label>
							<input
								id="photo"
								name="photo"
								class="input py-2.5"
								type="file"
								accept="image/jpeg,image/png,image/webp"
								required
								aria-describedby="photo-help"
								onchange={onPhoto}
							/>
							<span id="photo-help" class="hint">
								JPEG, PNG or WebP, up to 5 MB. Large photos are shrunk before upload. The photo is
								only read, never stored.
							</span>
						</div>
						<div>
							<button class="btn btn-primary" type="submit" disabled={busy || preparing}>
								{preparing ? 'Preparing photo…' : busy ? 'Importing…' : 'Import photo'}
							</button>
						</div>
					</form>
				{/if}
			{/if}
		</aside>

		{#if review}
			<section aria-label="Imported recipe" class="min-w-0 flex-[999_1_560px]">
				<RecipeForm
					values={review.values}
					errors={form && 'errors' in form ? form.errors : undefined}
					submitLabel="Save to recipe shelf"
					cancelHref="/recipes"
					cancelLabel="Discard"
					action="?/save"
				/>
			</section>
		{/if}
	</div>
</div>
