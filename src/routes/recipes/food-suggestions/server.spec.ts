import { beforeEach, describe, expect, it, vi } from 'vitest';

const suggest = vi.fn();
const getMany = vi.fn();
vi.mock('$lib/server/foods', () => ({ getFoodStore: () => ({ suggest, getMany }) }));

import { SUGGEST_MAX } from '$lib/domain/food-match';
import { GET } from './+server';

const call = (query: string, locals = { userID: 'alice' } as App.Locals) =>
	GET({ locals, url: new URL(`http://x/recipes/food-suggestions?${query}`) } as never);

describe('GET /recipes/food-suggestions', () => {
	beforeEach(() => {
		suggest.mockReset();
		getMany.mockReset().mockResolvedValue([]);
	});

	it('redirects signed-out visitors to sign-in', async () => {
		await expect(call('name=onion', {} as App.Locals)).rejects.toMatchObject({
			status: 303,
			location: '/signin'
		});
		expect(suggest).not.toHaveBeenCalled();
	});

	it('returns one suggestion per name, for the signed-in user', async () => {
		const onion = { id: '1', name: 'Onions, raw', own: false, units: ['g', 'each'] };
		suggest.mockResolvedValue([onion, null]);
		const res = await call('name=1+yellow+onion&name=saffron');
		expect(suggest).toHaveBeenCalledWith('alice', ['1 yellow onion', 'saffron']);
		expect(await res.json()).toEqual({ suggestions: [onion, null], foods: [] });
	});

	it('caps the number and length of names', async () => {
		suggest.mockResolvedValue([]);
		const many = Array.from({ length: SUGGEST_MAX + 10 }, () => `name=${'a'.repeat(200)}`);
		await call(many.join('&'));
		const names = suggest.mock.calls[0][1] as string[];
		expect(names).toHaveLength(SUGGEST_MAX);
		expect(names[0]).toHaveLength(120);
	});

	it('returns linked foods with their units', async () => {
		suggest.mockResolvedValue([]);
		const rice = { id: 'r', name: 'Rice', own: false, units: ['g', 'cup'] };
		getMany.mockResolvedValue([rice]);
		const res = await call('id=r');
		expect(getMany).toHaveBeenCalledWith('alice', ['r']);
		expect(await res.json()).toEqual({ suggestions: [], foods: [rice] });
	});
});
