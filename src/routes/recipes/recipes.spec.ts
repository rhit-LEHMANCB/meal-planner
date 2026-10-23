import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({
	list: vi.fn(),
	get: vi.fn(),
	create: vi.fn(),
	update: vi.fn(),
	remove: vi.fn()
}));

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$lib/server/recipes', () => ({ getRecipeStore: () => store }));

import { load as listLoad } from './+page.server';
import { actions as newActions } from './new/+page.server';
import { actions as showActions, load as showLoad } from './[id]/+page.server';
import { actions as editActions, load as editLoad } from './[id]/edit/+page.server';

const ME = 'user-me';
const THEIRS_ID = '11111111-1111-4111-8111-111111111111';

const locals = (userID: string | null = ME) => ({ userID, email: 'me@example.com' });
const formRequest = (fields: Record<string, string>) => {
	const body = new FormData();
	for (const [k, v] of Object.entries(fields)) body.set(k, v);
	return new Request('http://localhost/recipes', { method: 'POST', body });
};
const valid = { title: 'Chili', servings: '4', ingredients: 'beans', steps: 'Cook.' };

// The routes only use these event fields; the cast keeps the tests free of SvelteKit's full event type.
const event = <T>(fields: Record<string, unknown>) => fields as unknown as T;

beforeEach(() => vi.resetAllMocks());

describe('recipe list', () => {
	it('lists only the signed-in user and searches with their id', async () => {
		store.list.mockResolvedValue([{ id: 'a' }]);

		const data = await listLoad(
			event({ locals: locals(), url: new URL('http://localhost/recipes?q=chili') })
		);

		expect(store.list).toHaveBeenCalledWith(ME);
		expect(store.list).toHaveBeenCalledWith(ME, 'chili');
		expect(data).toMatchObject({ q: 'chili', total: 1 });
	});

	it('sends a signed-out request to sign-in instead of querying', async () => {
		await expect(
			listLoad(event({ locals: locals(null), url: new URL('http://localhost/recipes') }))
		).rejects.toMatchObject({ status: 303, location: '/signin' });
		expect(store.list).not.toHaveBeenCalled();
	});
});

describe("someone else's recipe behaves like a missing one", () => {
	beforeEach(() => {
		// The store answers "not found" for another owner's id, which is its contract.
		store.get.mockResolvedValue(null);
		store.update.mockResolvedValue(false);
		store.remove.mockResolvedValue(false);
	});

	it('load returns 404 and asks the store with the viewer, not the owner', async () => {
		await expect(
			showLoad(event({ locals: locals(), params: { id: THEIRS_ID } }))
		).rejects.toMatchObject({ status: 404 });
		expect(store.get).toHaveBeenCalledWith(ME, THEIRS_ID);
	});

	it('the edit page load returns 404', async () => {
		await expect(
			editLoad(event({ locals: locals(), params: { id: THEIRS_ID } }))
		).rejects.toMatchObject({ status: 404 });
	});

	it('the edit action returns 404 and saves nothing', async () => {
		await expect(
			editActions.default(
				event({
					request: formRequest(valid),
					locals: locals(),
					params: { id: THEIRS_ID }
				})
			)
		).rejects.toMatchObject({ status: 404 });
		expect(store.update).toHaveBeenCalledWith(
			ME,
			THEIRS_ID,
			expect.objectContaining({ title: 'Chili' })
		);
	});

	it('the delete action returns 404', async () => {
		await expect(
			showActions.delete(event({ locals: locals(), params: { id: THEIRS_ID } }))
		).rejects.toMatchObject({ status: 404 });
		expect(store.remove).toHaveBeenCalledWith(ME, THEIRS_ID);
	});
});

describe('create', () => {
	it('re-shows the form with errors and what was typed, saving nothing', async () => {
		const result = await newActions.default(
			event({ request: formRequest({ ...valid, title: '', servings: '0' }), locals: locals() })
		);

		expect(result).toMatchObject({
			status: 400,
			data: {
				errors: { title: expect.any(String), servings: expect.any(String) },
				values: { ingredients: 'beans' }
			}
		});
		expect(store.create).not.toHaveBeenCalled();
	});

	it('saves for the signed-in user and redirects to the new recipe', async () => {
		store.create.mockResolvedValue('new-id');

		await expect(
			newActions.default(event({ request: formRequest(valid), locals: locals() }))
		).rejects.toMatchObject({ status: 303, location: '/recipes/new-id' });
		expect(store.create).toHaveBeenCalledWith(
			ME,
			expect.objectContaining({ title: 'Chili', servings: 4 })
		);
	});
});

describe('edit and delete by the owner', () => {
	it('saves changes and returns to the recipe', async () => {
		store.update.mockResolvedValue(true);

		await expect(
			editActions.default(
				event({ request: formRequest(valid), locals: locals(), params: { id: 'r1' } })
			)
		).rejects.toMatchObject({ status: 303, location: '/recipes/r1' });
	});

	it('keeps the form and shows errors when an edit is invalid', async () => {
		const result = await editActions.default(
			event({
				request: formRequest({ ...valid, title: '' }),
				locals: locals(),
				params: { id: 'r1' }
			})
		);
		expect(result).toMatchObject({ status: 400, data: { errors: { title: expect.any(String) } } });
		expect(store.update).not.toHaveBeenCalled();
	});

	it('deletes and goes back to the list', async () => {
		store.remove.mockResolvedValue(true);

		await expect(
			showActions.delete(event({ locals: locals(), params: { id: 'r1' } }))
		).rejects.toMatchObject({ status: 303, location: '/recipes' });
	});

	it('shows a recipe with its ingredients in the stored order', async () => {
		store.get.mockResolvedValue({ id: 'r1', title: 'Chili', ingredients: ['a', 'b'] });
		const data = await showLoad(event({ locals: locals(), params: { id: 'r1' } }));
		expect(data.recipe.ingredients).toEqual(['a', 'b']);
	});
});
