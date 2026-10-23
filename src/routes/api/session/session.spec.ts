import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
	verifyIdToken: vi.fn(),
	createSessionCookie: vi.fn()
}));

vi.mock('$env/dynamic/private', () => ({ env: { ALLOWED_EMAILS: 'cook@example.com' } }));
vi.mock('$lib/server/admin', () => ({ getAdminAuth: () => auth }));

import { POST } from './+server';
import { POST as signOut } from '../../signout/+server';

const cookies = () => ({ set: vi.fn(), delete: vi.fn(), get: vi.fn() });
const post = (body: unknown, c = cookies()) =>
	POST({
		request: new Request('http://localhost/api/session', {
			method: 'POST',
			body: typeof body === 'string' ? body : JSON.stringify(body)
		}),
		cookies: c
	} as unknown as Parameters<typeof POST>[0]);

const now = () => Math.floor(Date.now() / 1000);

beforeEach(() => {
	vi.resetAllMocks();
	auth.createSessionCookie.mockResolvedValue('session-cookie-value');
});

describe('POST /api/session', () => {
	it('starts a session for a verified, allowlisted user', async () => {
		auth.verifyIdToken.mockResolvedValue({
			uid: 'u1',
			email: 'Cook@Example.com',
			email_verified: true,
			auth_time: now()
		});
		const c = cookies();

		const res = await post({ idToken: 'token' }, c);

		expect(res.status).toBe(200);
		expect(c.set).toHaveBeenCalledWith(
			'__session',
			'session-cookie-value',
			expect.objectContaining({ httpOnly: true, path: '/', maxAge: 60 * 60 * 24 * 5 })
		);
	});

	it('refuses an unverified email and sets no cookie', async () => {
		auth.verifyIdToken.mockResolvedValue({
			uid: 'u1',
			email: 'cook@example.com',
			email_verified: false,
			auth_time: now()
		});
		const c = cookies();

		const res = await post({ idToken: 'token' }, c);

		expect(res.status).toBe(403);
		expect(await res.json()).toEqual({ code: 'unverified' });
		expect(c.set).not.toHaveBeenCalled();
	});

	it('refuses an email that is not on the allowlist', async () => {
		auth.verifyIdToken.mockResolvedValue({
			uid: 'u2',
			email: 'stranger@example.com',
			email_verified: true,
			auth_time: now()
		});
		const c = cookies();

		const res = await post({ idToken: 'token' }, c);

		expect(res.status).toBe(403);
		expect(await res.json()).toEqual({ code: 'not-allowed' });
		expect(c.set).not.toHaveBeenCalled();
	});

	it('refuses a token Firebase rejects', async () => {
		auth.verifyIdToken.mockRejectedValue(new Error('bad token'));
		const res = await post({ idToken: 'token' });
		expect(res.status).toBe(401);
		expect(await res.json()).toEqual({ code: 'invalid' });
	});

	it('refuses a missing token or a body that is not JSON', async () => {
		expect((await post({})).status).toBe(400);
		expect((await post('not json')).status).toBe(400);
		expect(auth.verifyIdToken).not.toHaveBeenCalled();
	});

	it('requires a recent sign-in', async () => {
		auth.verifyIdToken.mockResolvedValue({
			uid: 'u1',
			email: 'cook@example.com',
			email_verified: true,
			auth_time: now() - 60 * 60
		});
		await expect(post({ idToken: 'token' })).rejects.toMatchObject({ status: 401 });
	});
});

describe('POST /signout', () => {
	it('clears the session cookie and redirects to sign-in', async () => {
		const c = cookies();
		await expect(
			signOut({ cookies: c } as unknown as Parameters<typeof signOut>[0])
		).rejects.toMatchObject({ status: 303, location: '/signin' });
		expect(c.delete).toHaveBeenCalledWith('__session', { path: '/' });
	});
});
