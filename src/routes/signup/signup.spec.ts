import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ createUser: vi.fn() }));

vi.mock('$env/dynamic/private', () => ({ env: { ALLOWED_EMAILS: 'Cook@Example.com' } }));
vi.mock('$lib/server/admin', () => ({ getAdminAuth: () => auth }));

import { actions } from './+page.server';

const submit = (fields: Record<string, string>) => {
	const body = new FormData();
	for (const [k, v] of Object.entries(fields)) body.set(k, v);
	return actions.default({
		request: new Request('http://localhost/signup', { method: 'POST', body })
	} as unknown as Parameters<typeof actions.default>[0]);
};

beforeEach(() => {
	vi.resetAllMocks();
	auth.createUser.mockResolvedValue({ uid: 'new' });
});

describe('sign-up action', () => {
	it('creates an account for an allowlisted email', async () => {
		const result = await submit({ email: 'cook@example.com', password: 'longenough' });

		expect(result).toEqual({ created: true, email: 'cook@example.com' });
		expect(auth.createUser).toHaveBeenCalledWith({
			email: 'cook@example.com',
			password: 'longenough',
			emailVerified: false
		});
	});

	it('refuses an email that is not on the allowlist and creates nothing', async () => {
		const result = await submit({ email: 'stranger@example.com', password: 'longenough' });

		expect(result).toMatchObject({ status: 403, data: { reason: 'not-invited' } });
		expect(auth.createUser).not.toHaveBeenCalled();
	});

	it('matches the allowlist ignoring case and spaces', async () => {
		await submit({ email: '  COOK@example.com ', password: 'longenough' });
		expect(auth.createUser).toHaveBeenCalledWith(
			expect.objectContaining({ email: 'cook@example.com' })
		);
	});

	it('refuses a password shorter than 8 characters', async () => {
		const result = await submit({ email: 'cook@example.com', password: 'short' });

		expect(result).toMatchObject({ status: 400, data: { reason: 'weak-password' } });
		expect(auth.createUser).not.toHaveBeenCalled();
	});

	it('reports an existing account', async () => {
		auth.createUser.mockRejectedValue({ code: 'auth/email-already-exists' });
		const result = await submit({ email: 'cook@example.com', password: 'longenough' });
		expect(result).toMatchObject({ status: 409, data: { reason: 'exists' } });
	});

	it('reports an unexpected Firebase failure without leaking details', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		auth.createUser.mockRejectedValue(new Error('boom'));
		const result = await submit({ email: 'cook@example.com', password: 'longenough' });
		expect(result).toMatchObject({ status: 500, data: { reason: 'error' } });
	});
});
