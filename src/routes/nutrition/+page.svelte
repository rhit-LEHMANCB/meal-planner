<script lang="ts">
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { formatGrams, formatKcal } from '$lib/domain/format';
	import { goalProgress } from '$lib/domain/nutrition';
	import { GOAL_LIMITS } from '$lib/domain/nutrition-form';
	import {
		addDays,
		dayName,
		monthDay,
		mondayOf,
		SLOT_LABELS,
		SLOTS,
		weekLabel,
		type Slot
	} from '$lib/domain/plan';
	import type { PageProps } from './$types';

	interface FoodOption {
		id: string;
		name: string;
		own: boolean;
		units: string[];
	}

	let { data, form }: PageProps = $props();

	/** Today in the browser's time zone; the server only knows UTC. */
	let localToday = $state<string | null>(null);
	const today = $derived(localToday ?? data.today);

	const weekHref = (monday: string) => `${resolve('/nutrition')}?week=${monday}`;
	const planHref = $derived(`${resolve('/plan')}?week=${data.monday}`);

	onMount(() => {
		const now = new Date();
		const local = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
		localToday = local;
		// Without an explicit week the server picked the UTC week; near midnight that can be the wrong one.
		if (!data.explicitWeek && mondayOf(local) !== data.monday) {
			// eslint-disable-next-line svelte/no-navigation-without-resolve -- built from resolve('/nutrition')
			goto(weekHref(mondayOf(local)), { replaceState: true });
		}
	});

	const view = $derived(data.view);
	const goals = $derived(data.goals);
	const isThisWeek = $derived(mondayOf(today) === data.monday);
	const todayDay = $derived(view.days.find((d) => d.date === today) ?? null);
	const todayKcal = $derived(todayDay ? goalProgress(todayDay.total.kcal, goals.kcal) : null);
	const macros = $derived(
		todayDay
			? [
					{
						name: 'Protein',
						p: goalProgress(todayDay.total.proteinG, goals.proteinG),
						color: 'bg-herb'
					},
					{
						name: 'Carbs',
						p: goalProgress(todayDay.total.carbsG, goals.carbsG),
						color: 'bg-leftover'
					},
					{ name: 'Fat', p: goalProgress(todayDay.total.fatG, goals.fatG), color: 'bg-tomato' }
				]
			: []
	);
	const pct = (kcal: number) => `${Math.min(100, (kcal / view.chartMax) * 100)}%`;

	const errors = $derived(
		(form && 'errors' in form ? form.errors : {}) as Record<string, string | undefined>
	);
	const logErrors = $derived(form?.action === 'log' ? errors : {});
	const goalErrors = $derived(form?.action === 'goals' ? errors : {});
	const formError = $derived(form?.action === 'remove' ? errors.form : logErrors.form);

	// Quick log form state.
	let kind = $state<'food' | 'recipe'>('food');
	let logDate = $state('');
	let foodQuery = $state('');
	let foods = $state<FoodOption[] | null>(null);
	let picked = $state<FoodOption | null>(null);
	let unit = $state('g');
	let busy = $state(false);

	$effect(() => {
		// Default the log day to today when it is in the week, else Monday.
		if (!logDate || !data.days.includes(logDate)) {
			logDate = data.days.includes(today) ? today : data.monday;
		}
	});

	const searchFoods = async () => {
		const q = foodQuery.trim();
		if (!q) return;
		try {
			const response = await fetch(`${resolve('/plan/foods')}?q=${encodeURIComponent(q)}`);
			if (response.ok && q === foodQuery.trim()) {
				foods = ((await response.json()) as { foods: FoodOption[] }).foods;
			}
		} catch {
			foods = [];
		}
	};

	const pick = (food: FoodOption) => {
		picked = food;
		unit = food.units.includes(unit) ? unit : 'g';
	};

	const slotLabel = (slot: string | null) =>
		slot && (SLOTS as readonly string[]).includes(slot) ? SLOT_LABELS[slot as Slot] : null;
</script>

<svelte:head><title>Nutrition</title></svelte:head>

<div class="flex flex-col gap-6">
	<header class="flex flex-wrap items-center gap-4">
		<div class="flex-[1_1_280px]">
			<h1 class="font-display text-4xl leading-tight font-bold">Nutrition</h1>
			<p class="mt-1.5 text-[15px] text-muted">
				<span class="font-bold text-[#3f5247]">Week of {weekLabel(data.monday)}</span>
				· planned meals plus anything you logged ·
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- built from resolve('/plan') -->
				<a href={planHref} class="font-bold text-herb">Open the plan</a>
			</p>
		</div>
		<nav aria-label="Weeks" class="flex gap-2">
			<!-- eslint-disable svelte/no-navigation-without-resolve -- built from resolve('/nutrition') -->
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

	{#if formError}
		<p class="notice notice-error" role="alert">{formError}</p>
	{/if}

	{#if todayDay && todayKcal}
		<section aria-label="Today" class="flex flex-wrap gap-5">
			<div class="card flex min-w-0 flex-[1_1_320px] flex-col gap-4 p-6" data-testid="today-card">
				<div class="text-sm font-bold text-muted">
					{dayName(today)} so far{#if todayDay.partial}<span class="font-medium">
							· partial</span
						>{/if}
				</div>
				<div class="flex items-baseline gap-2">
					<span class="font-display text-5xl leading-none font-bold"
						>{formatKcal(todayKcal.value)}</span
					>
					<span class="text-base text-muted">of {formatKcal(goals.kcal)} kcal</span>
				</div>
				<div
					class="h-3 rounded-md bg-[#e3e9df]"
					role="progressbar"
					aria-label="Calories today"
					aria-valuemin={0}
					aria-valuemax={goals.kcal}
					aria-valuenow={todayKcal.value}
				>
					<div
						class="h-3 rounded-md {todayKcal.over > 0 ? 'bg-tomato' : 'bg-herb'}"
						style="width: {todayKcal.percent}%"
					></div>
				</div>
				<div class="text-sm text-[#3f5247]" data-testid="kcal-left">
					{todayKcal.over > 0
						? `${formatKcal(todayKcal.over)} kcal over today`
						: `${formatKcal(todayKcal.left)} kcal left today`}
				</div>
			</div>
			<div class="card flex min-w-0 flex-[2_1_480px] flex-col gap-4 p-6">
				<div class="text-sm font-bold text-muted">Macros today</div>
				{#each macros as macro (macro.name)}
					<div class="flex flex-col gap-1.5">
						<div class="flex justify-between text-sm">
							<span class="font-bold">{macro.name}</span>
							<span class="text-[#3f5247]"
								>{formatGrams(macro.p.value)} of {formatGrams(macro.p.goal)}</span
							>
						</div>
						<div
							class="h-2.5 rounded bg-[#e3e9df]"
							role="progressbar"
							aria-label="{macro.name} today"
							aria-valuemin={0}
							aria-valuemax={macro.p.goal}
							aria-valuenow={macro.p.value}
						>
							<div class="h-2.5 rounded {macro.color}" style="width: {macro.p.percent}%"></div>
						</div>
					</div>
				{/each}
			</div>
		</section>
	{/if}

	<section aria-labelledby="chart-title" class="card flex flex-col gap-4 p-6">
		<div class="flex flex-wrap items-center gap-x-6 gap-y-3">
			<h2 id="chart-title" class="flex-[1_1_200px] font-display text-xl font-bold">
				Calories by day
			</h2>
			<div class="flex flex-wrap gap-4 text-[13px] text-[#3f5247]" aria-hidden="true">
				<span class="inline-flex items-center gap-1.5"
					><span class="size-3 rounded-sm bg-herb"></span>Planned</span
				>
				<span class="inline-flex items-center gap-1.5"
					><span class="size-3 rounded-sm bg-leftover"></span>Leftovers</span
				>
				<span class="inline-flex items-center gap-1.5"
					><span class="size-3 rounded-sm bg-food-muted"></span>Logged</span
				>
				<span class="inline-flex items-center gap-1.5"
					><span class="w-[18px] border-t-2 border-dashed border-tomato"></span>{formatKcal(
						goals.kcal
					)} goal</span
				>
			</div>
		</div>
		{#if view.empty}
			<p class="text-sm text-muted" data-testid="nutrition-empty">
				Nothing planned or logged this week.
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- built from resolve('/plan') -->
				<a href={planHref} class="font-bold text-herb">Plan some meals</a> or log food below.
			</p>
		{/if}
		<div class="overflow-x-auto" aria-hidden="true">
			<div class="relative flex h-[260px] min-w-[560px] items-end gap-4 border-b border-edge px-2">
				<div
					class="absolute right-0 left-0 border-t-2 border-dashed border-tomato"
					style="bottom: {pct(goals.kcal)}"
				></div>
				{#each view.days as day (day.date)}
					<div class="flex h-full min-w-0 flex-1 flex-col items-stretch justify-end">
						<div class="pb-1 text-center text-xs font-bold">
							{day.hasEntries ? formatKcal(day.total.kcal) : ''}{day.partial ? '*' : ''}
						</div>
						<div class="rounded-t-md bg-food-muted" style="height: {pct(day.logged.kcal)}"></div>
						<div class="bg-leftover" style="height: {pct(day.leftover.kcal)}"></div>
						<div class="bg-herb" style="height: {pct(day.planned.kcal)}"></div>
					</div>
				{/each}
			</div>
			<div class="flex min-w-[560px] gap-4 px-2 pt-2">
				{#each view.days as day (day.date)}
					<div
						class="min-w-0 flex-1 text-center text-[13px] font-medium {day.date === today
							? 'font-bold text-herb-dark'
							: 'text-[#3f5247]'}"
					>
						{dayName(day.date)}
					</div>
				{/each}
			</div>
		</div>
		{#if view.days.some((d) => d.partial)}
			<p class="text-[13px] text-muted">
				* Partial: some ingredients or entries that day have no nutrition.
			</p>
		{/if}
		<!-- Wrapped: a table caption sits outside the table box, so sr-only on the table would not hide it. -->
		<div class="sr-only">
			<table>
				<caption>Calories by day, week of {weekLabel(data.monday)}</caption>
				<thead>
					<tr
						><th scope="col">Day</th><th scope="col">Planned</th><th scope="col">Leftovers</th><th
							scope="col">Logged</th
						><th scope="col">Total</th></tr
					>
				</thead>
				<tbody>
					{#each view.days as day (day.date)}
						<tr data-day={day.date} data-total={Math.round(day.total.kcal)}>
							<th scope="row">{dayName(day.date)} {monthDay(day.date)}</th>
							<td>{formatKcal(day.planned.kcal)} kcal</td>
							<td>{formatKcal(day.leftover.kcal)} kcal</td>
							<td>{formatKcal(day.logged.kcal)} kcal</td>
							<td>{formatKcal(day.total.kcal)} kcal{day.partial ? ' (partial)' : ''}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>

	<div class="flex flex-wrap items-start gap-5">
		<section
			aria-labelledby="average-title"
			class="card flex min-w-0 flex-[1_1_360px] flex-col p-6"
		>
			<h2 id="average-title" class="mb-2 font-display text-xl font-bold">Weekly average</h2>
			{#if view.average}
				<dl data-testid="weekly-average">
					{#each [['Calories', `${formatKcal(view.average.kcal)} kcal`], ['Protein', formatGrams(view.average.proteinG)], ['Carbs', formatGrams(view.average.carbsG)], ['Fat', formatGrams(view.average.fatG)]] as [k, v] (k)}
						<div class="flex justify-between border-t border-[#e3e9df] py-2.5 text-[15px]">
							<dt>{k}</dt>
							<dd class="font-bold">{v}</dd>
						</div>
					{/each}
				</dl>
				<p class="mt-2 text-[13px] text-muted">
					Per day, over the days with anything planned or logged.
				</p>
			{:else}
				<p class="text-sm text-muted">No days with food yet.</p>
			{/if}
		</section>

		<section
			aria-labelledby="goals-title"
			class="card flex min-w-0 flex-[1_1_360px] flex-col gap-3 p-6"
		>
			<h2 id="goals-title" class="font-display text-xl font-bold">Daily goals</h2>
			<form
				method="POST"
				action="?week={data.monday}&/goals"
				class="flex flex-col gap-3"
				use:enhance={() =>
					async ({ update }) => {
						await update({ reset: false });
					}}
			>
				<div class="flex flex-wrap gap-3">
					{#each [['kcal', 'Calories (kcal)', goals.kcal, GOAL_LIMITS.kcal.min, GOAL_LIMITS.kcal.max], ['proteinG', 'Protein (g)', goals.proteinG, 0, GOAL_LIMITS.macro.max], ['carbsG', 'Carbs (g)', goals.carbsG, 0, GOAL_LIMITS.macro.max], ['fatG', 'Fat (g)', goals.fatG, 0, GOAL_LIMITS.macro.max]] as const as [name, label, value, min, max] (name)}
						<div class="flex flex-[1_1_120px] flex-col gap-1.5">
							<label class="text-[13px] font-bold text-muted" for="goal-{name}">{label}</label>
							<input
								id="goal-{name}"
								{name}
								class="input min-h-11 px-3"
								inputmode="numeric"
								{value}
								{min}
								{max}
								aria-invalid={goalErrors[name] ? 'true' : undefined}
								aria-describedby={goalErrors[name] ? `goal-${name}-error` : undefined}
							/>
							{#if goalErrors[name]}
								<span id="goal-{name}-error" class="field-error">{goalErrors[name]}</span>
							{/if}
						</div>
					{/each}
				</div>
				<div class="flex items-center gap-3">
					<button type="submit" class="btn btn-primary min-h-11 px-5">Save goals</button>
					{#if form?.action === 'goals' && 'saved' in form}
						<span class="text-sm text-herb-dark" role="status">Goals saved.</span>
					{/if}
				</div>
			</form>
		</section>
	</div>

	<div class="flex flex-wrap items-start gap-5">
		<section
			aria-labelledby="log-title"
			class="card flex min-w-0 flex-[1_1_360px] flex-col gap-3 p-6"
		>
			<h2 id="log-title" class="font-display text-xl font-bold">Log food</h2>
			<p class="text-sm text-muted">For anything you ate that is not on the plan.</p>
			<form
				method="POST"
				action="?week={data.monday}&/log"
				class="flex flex-col gap-3"
				use:enhance={() => {
					busy = true;
					return async ({ result, update }) => {
						await update({ reset: false });
						busy = false;
						if (result.type === 'success') {
							picked = null;
							foods = null;
							foodQuery = '';
						}
					};
				}}
			>
				<input type="hidden" name="week" value={data.monday} />
				<fieldset class="flex gap-4">
					<legend class="sr-only">What to log</legend>
					<label class="flex min-h-11 items-center gap-2"
						><input type="radio" name="kind" value="food" bind:group={kind} /> Food</label
					>
					<label class="flex min-h-11 items-center gap-2"
						><input type="radio" name="kind" value="recipe" bind:group={kind} /> Recipe</label
					>
				</fieldset>

				{#if kind === 'food'}
					<input type="hidden" name="foodId" value={picked?.id ?? ''} />
					<div class="flex flex-col gap-1.5">
						<label class="label" for="log-food-search">Food</label>
						<div class="flex flex-wrap gap-2">
							<input
								id="log-food-search"
								type="search"
								class="input min-h-11 min-w-0 flex-1 px-3"
								placeholder="Search foods, e.g. apple"
								bind:value={foodQuery}
								onkeydown={(e) => {
									if (e.key === 'Enter') {
										e.preventDefault();
										void searchFoods();
									}
								}}
							/>
							<button type="button" class="btn btn-secondary min-h-11" onclick={searchFoods}
								>Search</button
							>
						</div>
						{#if picked}
							<span class="text-sm" data-testid="log-picked"
								>Picked: <strong>{picked.name}</strong></span
							>
						{/if}
						{#if logErrors.foodId}<span class="field-error">{logErrors.foodId}</span>{/if}
						{#if foods && foods.length > 0}
							<ul class="flex max-h-64 flex-col gap-1 overflow-y-auto" aria-label="Foods found">
								{#each foods as food (food.id)}
									<li>
										<button
											type="button"
											class="flex min-h-11 w-full items-center rounded-lg px-3 text-left hover:bg-herb-tint {picked?.id ===
											food.id
												? 'bg-herb-tint font-bold'
												: ''}"
											aria-pressed={picked?.id === food.id}
											onclick={() => pick(food)}
										>
											{food.name}
											{#if food.own}<span class="ml-2 text-xs text-muted">Yours</span>{/if}
										</button>
									</li>
								{/each}
							</ul>
						{:else if foods}
							<p class="text-sm text-muted">No foods match.</p>
						{/if}
					</div>
					<div class="flex flex-wrap gap-3">
						<div class="flex flex-[1_1_100px] flex-col gap-1.5">
							<label class="label" for="log-amount">Amount</label>
							<input
								id="log-amount"
								name="amount"
								class="input min-h-11 px-3"
								inputmode="decimal"
								aria-invalid={logErrors.amount ? 'true' : undefined}
							/>
							{#if logErrors.amount}<span class="field-error">{logErrors.amount}</span>{/if}
						</div>
						<div class="flex flex-[1_1_100px] flex-col gap-1.5">
							<label class="label" for="log-unit">Unit</label>
							<select id="log-unit" name="unit" class="input min-h-11 px-3" bind:value={unit}>
								{#each picked?.units ?? ['g'] as u (u)}
									<option value={u}>{u}</option>
								{/each}
							</select>
							{#if logErrors.unit}<span class="field-error">{logErrors.unit}</span>{/if}
						</div>
					</div>
				{:else}
					<div class="flex flex-wrap gap-3">
						<div class="flex flex-[2_1_200px] flex-col gap-1.5">
							<label class="label" for="log-recipe">Recipe</label>
							<select id="log-recipe" name="recipeId" class="input min-h-11 px-3">
								{#each data.recipes as recipe (recipe.id)}
									<option value={recipe.id}>{recipe.title}</option>
								{/each}
							</select>
							{#if data.recipes.length === 0}
								<span class="hint">You have no recipes yet.</span>
							{/if}
							{#if logErrors.recipeId}<span class="field-error">{logErrors.recipeId}</span>{/if}
						</div>
						<div class="flex flex-[1_1_100px] flex-col gap-1.5">
							<label class="label" for="log-servings">Servings</label>
							<input
								id="log-servings"
								name="servings"
								class="input min-h-11 px-3"
								inputmode="decimal"
								value="1"
								aria-invalid={logErrors.servings ? 'true' : undefined}
							/>
							{#if logErrors.servings}<span class="field-error">{logErrors.servings}</span>{/if}
						</div>
					</div>
				{/if}

				<div class="flex flex-wrap gap-3">
					<div class="flex flex-[1_1_140px] flex-col gap-1.5">
						<label class="label" for="log-date">Day</label>
						<select id="log-date" name="date" class="input min-h-11 px-3" bind:value={logDate}>
							{#each data.days as date (date)}
								<option value={date}>{dayName(date)} {monthDay(date)}</option>
							{/each}
						</select>
						{#if logErrors.date}<span class="field-error">{logErrors.date}</span>{/if}
					</div>
					<div class="flex flex-[1_1_140px] flex-col gap-1.5">
						<label class="label" for="log-slot">Meal (optional)</label>
						<select id="log-slot" name="slot" class="input min-h-11 px-3">
							<option value="">None</option>
							{#each SLOTS as slot (slot)}
								<option value={slot}>{SLOT_LABELS[slot]}</option>
							{/each}
						</select>
					</div>
				</div>
				<div class="flex items-center gap-3">
					<button type="submit" class="btn btn-primary min-h-11 px-5" disabled={busy}>Log it</button
					>
					{#if form?.action === 'log' && 'logged' in form}
						<span class="text-sm text-herb-dark" role="status">Logged.</span>
					{/if}
				</div>
			</form>
		</section>

		<section
			aria-labelledby="logged-title"
			class="card flex min-w-0 flex-[1_1_360px] flex-col gap-3 p-6"
		>
			<h2 id="logged-title" class="font-display text-xl font-bold">Logged this week</h2>
			{#if view.logsByDay.length === 0}
				<p class="text-sm text-muted">Nothing logged this week.</p>
			{:else}
				{#each view.logsByDay as day (day.date)}
					<div class="flex flex-col">
						<h3 class="text-sm font-bold text-muted">{dayName(day.date)} {monthDay(day.date)}</h3>
						<ul>
							{#each day.logs as log (log.id)}
								<li
									class="flex items-center justify-between gap-3 border-t border-[#e3e9df] py-2"
									data-log={log.id}
								>
									<span class="min-w-0">
										{log.label}{#if slotLabel(log.slot)}<span class="text-muted">
												· {slotLabel(log.slot)}</span
											>{/if}
										<span class="block text-[13px] text-muted"
											>{formatKcal(log.macros.kcal)} kcal</span
										>
									</span>
									<form method="POST" action="?week={data.monday}&/remove" use:enhance>
										<input type="hidden" name="logId" value={log.id} />
										<button
											type="submit"
											class="btn btn-secondary min-h-11 px-3"
											aria-label="Delete {log.label}">Delete</button
										>
									</form>
								</li>
							{/each}
						</ul>
					</div>
				{/each}
			{/if}
		</section>
	</div>

	<p class="text-[13px] text-muted">
		Shared food data: USDA FoodData Central (SR Legacy). Your own foods use the numbers you entered.
	</p>
</div>
