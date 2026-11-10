import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GroceryWeek } from '$lib/server/grocery';

const store = {
	getWeek: vi.fn<(userId: string, monday: string) => Promise<GroceryWeek>>(),
	setTick: vi.fn(),
	addExtra: vi.fn(),
	setExtraChecked: vi.fn(),
	removeExtra: vi.fn(),
	setAisle: vi.fn()
};

vi.mock('$lib/server/grocery', () => ({ getGroceryStore: () => store }));

import { actions, load } from './+page.server';

const MON = '2030-02-04';
const ID = '6f1c1a52-6d0f-4d38-9a5c-2b0e7d0f8a11';

const week = (over: Partial<GroceryWeek> = {}): GroceryWeek => ({
	sources: [
		{
			meal: 'Turkey chili',
			scale: 1.5,
			lines: [{ name: 'onion', quantity: 2, unit: null, aisle: null }]
		}
	],
	cooks: 1,
	foods: 0,
	ticks: new Map(),
	extras: [],
	choices: new Map(),
	...over
});

const signedIn = { userID: 'alice' } as App.Locals;

const post = (fields: Record<string, string>, locals = signedIn) => {
	const body = new FormData();
	for (const [k, v] of Object.entries(fields)) body.set(k, v);
	return {
		locals,
		request: new Request('http://localhost/grocery', { method: 'POST', body })
	} as never;
};

const loadAt = (search: string, locals = signedIn) =>
	load({ locals, url: new URL(`http://localhost/grocery${search}`) } as never);

/** The thrown redirect or error of a call, or undefined when it returned. */
const thrown = async (fn: () => Promise<unknown>) => {
	try {
		await fn();
	} catch (e) {
		return e as { status: number; location?: string };
	}
};

beforeEach(() => {
	vi.clearAllMocks();
	store.getWeek.mockResolvedValue(week());
});

describe('load', () => {
	it('builds the view for the week in the address', async () => {
		const data = await loadAt(`?week=${MON}`);
		expect(store.getWeek).toHaveBeenCalledWith('alice', MON);
		expect(data.monday).toBe(MON);
		expect(data.view.sections[0].items[0]).toMatchObject({ name: 'Onion', amount: '3' });
	});

	it('redirects a date that is not a Monday to its Monday', async () => {
		expect(await thrown(() => loadAt('?week=2030-02-06'))).toMatchObject({
			status: 307,
			location: `/grocery?week=${MON}`
		});
	});

	it('sends signed-out visitors to sign in', async () => {
		expect(await thrown(() => loadAt(`?week=${MON}`, {} as App.Locals))).toMatchObject({
			status: 303,
			location: '/signin'
		});
		expect(store.getWeek).not.toHaveBeenCalled();
	});
});

describe('tick', () => {
	it('stores the amounts worked out on the server', async () => {
		expect(await actions.tick(post({ week: MON, key: 'onion', checked: 'true' }))).toEqual({
			action: 'tick'
		});
		expect(store.setTick).toHaveBeenCalledWith(
			'alice',
			MON,
			{ key: 'onion', name: 'Onion', snapshot: '-=3' },
			['onion']
		);
	});

	it('refuses to tick an item that is no longer on the list', async () => {
		const result = await actions.tick(post({ week: MON, key: 'leek', checked: 'true' }));
		expect(result).toMatchObject({ status: 404 });
		expect(store.setTick).not.toHaveBeenCalled();
	});

	it('still unticks an item that is no longer on the list', async () => {
		await actions.tick(post({ week: MON, key: 'leek', checked: 'false' }));
		expect(store.setTick).toHaveBeenCalledWith(
			'alice',
			MON,
			{ key: 'leek', name: 'leek', snapshot: null },
			['onion']
		);
	});

	it('refuses a missing or non-Monday week', async () => {
		for (const bad of ['', 'garbage', '2030-02-06']) {
			const result = await actions.tick(post({ week: bad, key: 'onion', checked: 'true' }));
			expect(result).toMatchObject({ status: 400 });
		}
		expect(store.setTick).not.toHaveBeenCalled();
	});
});

describe('add', () => {
	it('adds the parsed item to the week', async () => {
		store.addExtra.mockResolvedValue({ ok: true, value: ID });
		expect(await actions.add(post({ week: MON, text: '2 paper towels' }))).toMatchObject({
			added: true
		});
		expect(store.addExtra).toHaveBeenCalledWith('alice', MON, {
			name: 'paper towels',
			quantity: 2,
			unit: null
		});
	});

	it('refuses blank text with a field error', async () => {
		expect(await actions.add(post({ week: MON, text: ' ' }))).toMatchObject({
			status: 400,
			data: { errors: { text: 'Enter an item to add.' } }
		});
	});

	it('answers 409 at the per-week cap', async () => {
		store.addExtra.mockResolvedValue({ ok: false, reason: 'too_many' });
		expect(await actions.add(post({ week: MON, text: 'milk' }))).toMatchObject({ status: 409 });
	});
});

describe('extra items', () => {
	it('answers 404 for an item the user does not own', async () => {
		store.setExtraChecked.mockResolvedValue({ ok: false, reason: 'not_found' });
		store.removeExtra.mockResolvedValue({ ok: false, reason: 'not_found' });
		expect(await actions.extraTick(post({ week: MON, id: ID, checked: 'true' }))).toMatchObject({
			status: 404
		});
		expect(await actions.remove(post({ week: MON, id: ID }))).toMatchObject({ status: 404 });
		expect(store.setExtraChecked).toHaveBeenCalledWith('alice', ID, true);
		expect(store.removeExtra).toHaveBeenCalledWith('alice', ID);
	});
});

describe('aisle', () => {
	it('remembers a listed aisle under the normalized name', async () => {
		await actions.aisle(post({ week: MON, key: 'Gochujang ', aisle: 'Pantry' }));
		expect(store.setAisle).toHaveBeenCalledWith('alice', 'gochujang', 'Pantry');
	});

	it('refuses an aisle that is not listed', async () => {
		expect(
			await actions.aisle(post({ week: MON, key: 'gochujang', aisle: 'Garage' }))
		).toMatchObject({ status: 400, data: { errors: { aisle: 'Pick an aisle from the list.' } } });
		expect(store.setAisle).not.toHaveBeenCalled();
	});
});
