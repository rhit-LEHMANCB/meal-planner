// Renders the recipe screens on the server with sample data, so their states are checked
// without needing a signed-in browser session.
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import RecipeForm from '$lib/components/RecipeForm.svelte';
import ListPage from './+page.svelte';
import DetailPage from './[id]/+page.svelte';

const html = (component: unknown, props: Record<string, unknown>) =>
	render(component as Parameters<typeof render>[0], { props }).body;

const summary = (over: Record<string, unknown> = {}) => ({
	id: '11111111-1111-4111-8111-111111111111',
	title: 'Turkey Chili',
	servings: 6,
	totalMinutes: 55,
	sourceUrl: 'https://www.example.com/chili',
	createdAt: new Date(),
	ingredientCount: 9,
	...over
});

describe('recipe list', () => {
	it('invites a new user to add their first recipe', () => {
		const out = html(ListPage, { data: { q: '', total: 0, recipes: [] } });
		expect(out).toContain('You have no recipes yet');
		expect(out).toContain('Add your first recipe');
		expect(out).not.toContain('Search by title');
	});

	it('shows cards with servings, time, ingredient count and source host', () => {
		const out = html(ListPage, { data: { q: '', total: 1, recipes: [summary()] } });
		expect(out).toContain('Turkey Chili');
		expect(out).toContain('6 servings · 55 min');
		expect(out).toContain('9 ingredients · example.com');
		expect(out).toContain('/recipes/11111111-1111-4111-8111-111111111111');
	});

	it('says when a search matches nothing and offers to clear it', () => {
		const out = html(ListPage, { data: { q: 'pizza', total: 3, recipes: [] } });
		expect(out).toContain('No recipes match');
		expect(out).toContain('Clear search');
	});

	it('reports the match count for a search', () => {
		const out = html(ListPage, { data: { q: 'chili', total: 9, recipes: [summary()] } });
		expect(out).toContain('Showing 1 of 9');
	});

	it('escapes recipe text instead of rendering it as markup', () => {
		const out = html(ListPage, {
			data: { q: '', total: 1, recipes: [summary({ title: '<img src=x onerror=alert(1)>' })] }
		});
		expect(out).not.toContain('<img src=x');
		expect(out).toContain('&lt;img');
	});
});

describe('recipe detail', () => {
	const recipe = {
		id: '11111111-1111-4111-8111-111111111111',
		title: 'Turkey Chili',
		servings: 1,
		totalMinutes: 90,
		sourceUrl: 'https://www.example.com/chili',
		ingredients: ['1 lb turkey', '1 onion'],
		instructions: ['Brown the turkey.', 'Simmer.'],
		createdAt: new Date()
	};

	it('shows meta, ingredients and steps in order, and a safe external link', () => {
		const out = html(DetailPage, { data: { recipe } });
		expect(out).toContain('1 serving');
		expect(out).toContain('1 h 30 min');
		expect(out.indexOf('1 lb turkey')).toBeLessThan(out.indexOf('1 onion'));
		expect(out.indexOf('Brown the turkey.')).toBeLessThan(out.indexOf('Simmer.'));
		expect(out).toContain('target="_blank"');
		expect(out).toContain('rel="noopener noreferrer"');
		expect(out).toContain('example.com ↗');
	});

	it('includes the delete confirmation with a delete action and a cancel', () => {
		const out = html(DetailPage, { data: { recipe } });
		expect(out).toContain('Delete this recipe?');
		expect(out).toContain('action="?/delete"');
		expect(out).toContain('Cancel');
	});

	it('handles a recipe with no ingredients, steps, time or link', () => {
		const out = html(DetailPage, {
			data: {
				recipe: {
					...recipe,
					ingredients: [],
					instructions: [],
					totalMinutes: null,
					sourceUrl: null
				}
			}
		});
		expect(out).toContain('No ingredients yet');
		expect(out).toContain('No steps yet');
		expect(out).not.toContain('target="_blank"');
	});

	it('never links to a source that is not a web address', () => {
		const out = html(DetailPage, {
			data: { recipe: { ...recipe, sourceUrl: 'javascript:alert(1)' } }
		});
		expect(out).not.toContain('javascript:');
	});
});

describe('recipe form', () => {
	const values = {
		title: 'Chili',
		servings: '4',
		totalMinutes: '',
		sourceUrl: 'example.com/chili',
		ingredients: 'beans\nrice',
		steps: 'Cook.'
	};

	it('refills what was typed and keeps one item per line', () => {
		const out = html(RecipeForm, { values, submitLabel: 'Save recipe', cancelHref: '/recipes' });
		expect(out).toContain('value="Chili"');
		expect(out).toContain('beans\nrice');
		expect(out).toContain('Save recipe');
	});

	it('shows each error next to its field and marks the field invalid', () => {
		const out = html(RecipeForm, {
			values,
			errors: { sourceUrl: 'That link does not look right. Start it with http:// or https://.' },
			submitLabel: 'Save recipe',
			cancelHref: '/recipes'
		});
		expect(out).toContain('That link does not look right');
		expect(out).toContain('aria-invalid="true"');
		expect(out).toContain('Fix the highlighted fields');
	});

	it('shows no error banner for a clean form', () => {
		const out = html(RecipeForm, { values, submitLabel: 'Save', cancelHref: '/recipes' });
		expect(out).not.toContain('Fix the highlighted fields');
		expect(out).not.toContain('aria-invalid');
	});
});
