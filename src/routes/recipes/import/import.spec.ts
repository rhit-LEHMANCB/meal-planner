import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';

const importer = vi.hoisted(() => ({
	fromLink: vi.fn(),
	fromText: vi.fn(),
	fromPhoto: vi.fn()
}));
const usage = vi.hoisted(() => ({ remainingToday: vi.fn() }));
const store = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$lib/server/ai/import', () => ({ getImporter: () => importer }));
vi.mock('$lib/server/import-usage', () => ({ getImportUsage: () => usage, DAILY_AI_IMPORTS: 20 }));
vi.mock('$lib/server/recipes', () => ({ getRecipeStore: () => store }));

import { actions, load } from './+page.server';
import ImportPage from './+page.svelte';

const ME = 'user-me';
const locals = (userID: string | null = ME) => ({ userID, email: 'me@example.com' });
const event = <T>(fields: Record<string, unknown>) => fields as unknown as T;
const post = (fields: Record<string, string | File>) => {
	const body = new FormData();
	for (const [k, v] of Object.entries(fields)) body.set(k, v);
	return new Request('http://localhost/recipes/import', { method: 'POST', body });
};

const draft = {
	title: 'Turkey Chili',
	servings: null,
	totalMinutes: 55,
	sourceUrl: 'https://example.com/chili',
	ingredients: [
		{ raw: '1 lb ground turkey', quantity: 1, unit: 'lb', name: 'ground turkey', note: null },
		{ raw: '2 scoops protein', quantity: 2, unit: 'scoop', name: 'protein', note: null }
	],
	steps: ['Brown the turkey.']
};

beforeEach(() => {
	vi.resetAllMocks();
	usage.remainingToday.mockResolvedValue(17);
});

describe('import page load', () => {
	it('shows how many AI imports are left for the signed-in user', async () => {
		const data = await load(
			event({ locals: locals(), url: new URL('http://localhost/recipes/import?source=photo') })
		);
		expect(data).toEqual({ source: 'photo', aiLeft: 17, dailyLimit: 20 });
		expect(usage.remainingToday).toHaveBeenCalledWith(ME);
	});

	it('sends a signed-out visitor to sign-in without importing anything', async () => {
		await expect(
			load(event({ locals: locals(null), url: new URL('http://localhost/recipes/import') }))
		).rejects.toMatchObject({ status: 303, location: '/signin' });
		await expect(
			actions.link(event({ request: post({ link: 'https://example.com' }), locals: locals(null) }))
		).rejects.toMatchObject({ status: 303, location: '/signin' });
		expect(importer.fromLink).not.toHaveBeenCalled();
	});
});

describe('import actions', () => {
	it('returns the draft as review values without saving', async () => {
		importer.fromLink.mockResolvedValue({
			ok: true,
			via: 'ai',
			draft,
			droppedIngredients: 2,
			droppedSteps: 0,
			truncated: false
		});
		const result = await actions.link(
			event({ request: post({ link: ' https://example.com/chili ' }), locals: locals() })
		);
		expect(importer.fromLink).toHaveBeenCalledWith(ME, 'https://example.com/chili');
		expect(result).toMatchObject({
			source: 'link',
			review: {
				values: { title: 'Turkey Chili', servings: '', sourceUrl: 'https://example.com/chili' },
				info: { via: 'ai', ingredientCount: 2, needsCheck: 1, droppedIngredients: 2 }
			}
		});
		expect(store.create).not.toHaveBeenCalled();
	});

	it('explains a blocked link and keeps it for pasted text', async () => {
		importer.fromLink.mockResolvedValue({ ok: false, reason: 'link-unreadable' });
		const result = await actions.link(
			event({ request: post({ link: 'https://blocked.example/' }), locals: locals() })
		);
		expect(result).toMatchObject({
			status: 422,
			data: {
				reason: 'link-unreadable',
				link: 'https://blocked.example/',
				message: expect.stringContaining('Paste')
			}
		});
	});

	it.each([
		['cooldown', 429, 'wait'],
		['daily-limit', 429, 'midnight UTC'],
		['link-refused', 400, 'public web pages'],
		['unavailable', 503, 'unavailable']
	])('maps %s to status %i with a plain message', async (reason, status, words) => {
		importer.fromText.mockResolvedValue({ ok: false, reason });
		const result = await actions.text(
			event({ request: post({ text: 'Soup', sourceUrl: '' }), locals: locals() })
		);
		expect(result).toMatchObject({
			status,
			data: { message: expect.stringContaining(words), text: 'Soup' }
		});
	});

	it('passes a carried-over link and the photo to the importer', async () => {
		importer.fromText.mockResolvedValue({ ok: false, reason: 'no-recipe' });
		await actions.text(
			event({
				request: post({ text: 'Soup', sourceUrl: 'https://blocked.example/' }),
				locals: locals()
			})
		);
		expect(importer.fromText).toHaveBeenCalledWith(ME, 'Soup', 'https://blocked.example/');

		importer.fromPhoto.mockResolvedValue({ ok: false, reason: 'photo-type' });
		const file = new File(['x'], 'card.jpg', { type: 'image/jpeg' });
		await actions.photo(event({ request: post({ photo: file }), locals: locals() }));
		expect(importer.fromPhoto).toHaveBeenCalledWith(ME, expect.any(File));
	});
});

describe('saving a reviewed import', () => {
	const review = (fields: Record<string, string>) => {
		const body = new FormData();
		for (const [k, v] of Object.entries({
			title: 'Turkey Chili',
			servings: '6',
			steps: 'Cook.',
			...fields
		}))
			body.set(k, v);
		body.append('ingredientRaw', '1 lb ground turkey');
		body.append('ingredientAmount', '2');
		body.append('ingredientUnit', 'lb');
		body.append('ingredientName', 'ground turkey');
		body.append('ingredientNote', '');
		return new Request('http://localhost/recipes/import', { method: 'POST', body });
	};

	it('saves with the user edits for the signed-in user and opens the recipe', async () => {
		store.create.mockResolvedValue('new-id');
		await expect(
			actions.save(event({ request: review({}), locals: locals() }))
		).rejects.toMatchObject({ status: 303, location: '/recipes/new-id' });
		expect(store.create).toHaveBeenCalledWith(
			ME,
			expect.objectContaining({
				title: 'Turkey Chili',
				ingredients: [expect.objectContaining({ quantity: 2, unit: 'lb', name: 'ground turkey' })]
			})
		);
	});

	it('keeps the review and every edit when servings are missing', async () => {
		const result = await actions.save(
			event({ request: review({ servings: '' }), locals: locals() })
		);
		expect(result).toMatchObject({
			status: 400,
			data: {
				errors: { servings: expect.stringContaining('whole number') },
				review: {
					values: { title: 'Turkey Chili', ingredients: [{ amount: '2', name: 'ground turkey' }] }
				}
			}
		});
		expect(store.create).not.toHaveBeenCalled();
	});
});

describe('import page', () => {
	const data = { source: 'link', aiLeft: 17, dailyLimit: 20 };
	const html = (form: unknown) =>
		render(ImportPage as never, { props: { data, form } as never }).body;

	it('offers the three sources and the AI imports left', () => {
		const out = html(null);
		expect(out).toContain('Import a recipe');
		for (const label of ['Link', 'Paste text', 'Photo', 'Recipe link'])
			expect(out).toContain(label);
		expect(out).toContain('17 of 20 AI imports left today');
	});

	it('shows the review with notices, chips, Discard and Save to recipe shelf', () => {
		const out = html({
			source: 'link',
			review: {
				values: {
					title: 'Turkey Chili',
					servings: '',
					totalMinutes: '55',
					sourceUrl: 'https://example.com/chili',
					ingredients: [
						{ raw: '1 lb ground turkey', amount: '1', unit: 'lb', name: 'ground turkey', note: '' },
						{ raw: 'Salt to taste', amount: '', unit: '', name: 'Salt', note: 'to taste' }
					],
					steps: 'Brown.'
				},
				info: {
					via: 'ai',
					ingredientCount: 2,
					needsCheck: 0,
					droppedIngredients: 2,
					droppedSteps: 0,
					truncated: false
				}
			}
		});
		expect(out).toContain('Review imported recipe');
		expect(out).toContain('AI parsed 2 ingredient lines.');
		expect(out).toContain('2 lines could not be read and were left out.');
		expect(out).toContain('does not say how many servings');
		expect(out).toContain('Save to recipe shelf');
		expect(out).toContain('Discard');
		expect(out).toContain('action="?/save"');
		expect(out).toContain('Parsed');
		expect(out).toContain('No amount');
		expect(out).not.toMatch(/kcal|calories|protein/i);
	});

	it('says when structured data was used', () => {
		const out = html({
			source: 'link',
			review: {
				values: {
					title: 'Chili',
					servings: '6',
					totalMinutes: '',
					sourceUrl: '',
					ingredients: [],
					steps: ''
				},
				info: {
					via: 'structured',
					ingredientCount: 0,
					needsCheck: 0,
					droppedIngredients: 0,
					droppedSteps: 0,
					truncated: false
				}
			}
		});
		expect(out).toContain('Structured data found.');
		expect(out).not.toContain('too long to read completely');
	});

	it('warns when the AI answer was cut off', () => {
		const out = html({
			source: 'text',
			review: {
				values: {
					title: 'Feast',
					servings: '6',
					totalMinutes: '',
					sourceUrl: '',
					ingredients: [],
					steps: ''
				},
				info: {
					via: 'ai',
					ingredientCount: 0,
					needsCheck: 0,
					droppedIngredients: 0,
					droppedSteps: 0,
					truncated: true
				}
			}
		});
		expect(out).toContain('too long to read completely');
	});

	it('switches a blocked link to pasted text and keeps the link', () => {
		const out = html({
			source: 'link',
			reason: 'link-unreadable',
			message: 'We could not read a recipe from that page.',
			link: 'https://blocked.example/',
			text: '',
			sourceUrl: ''
		});
		expect(out).toContain('We could not read a recipe from that page.');
		expect(out).toContain('Recipe text');
		expect(out).toContain('name="sourceUrl" value="https://blocked.example/"');
	});
});
