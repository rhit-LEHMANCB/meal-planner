import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ verifySessionCookie: vi.fn() }));
const allow = vi.hoisted(() => ({ list: 'cook@example.com' }));

vi.mock('$env/dynamic/private', () => ({
	env: {
		get ALLOWED_EMAILS() {
			return allow.list;
		}
	}
}));
vi.mock('$lib/server/admin', () => ({ getAdminAuth: () => auth }));

import { handle } from './hooks.server';

const run = async (path: string, sessionCookie?: string) => {
	const cookies = {
		get: vi.fn((name: string) => (name === '__session' ? sessionCookie : undefined)),
		delete: vi.fn(),
		set: vi.fn()
	};
	const event = {
		url: new URL(`http://localhost${path}`),
		cookies,
		locals: {} as App.Locals
	};
	const resolve = vi.fn(async () => new Response('ok'));
	const result = handle({ event, resolve } as unknown as Parameters<typeof handle>[0]);
	return { event, cookies, resolve, result };
};

const validClaims = { uid: 'u1', email: 'cook@example.com', email_verified: true };

beforeEach(() => {
	vi.resetAllMocks();
	allow.list = 'cook@example.com';
});

describe('handle', () => {
	it('redirects a signed-out visitor from a protected page to sign-in', async () => {
		const { result, resolve } = await run('/recipes');
		await expect(result).rejects.toMatchObject({ status: 303, location: '/signin' });
		expect(resolve).not.toHaveBeenCalled();
	});

	it('lets a signed-out visitor open the auth pages and the health check', async () => {
		for (const path of ['/signin', '/signup', '/reset', '/api/health']) {
			const { result } = await run(path);
			const res = await result;
			expect(res.status, path).toBe(200);
		}
	});

	it('sets the user for a valid session and keeps the page private', async () => {
		auth.verifySessionCookie.mockResolvedValue(validClaims);
		const { result, event } = await run('/recipes', 'cookie');
		const res = await result;
		expect(event.locals).toEqual({ userID: 'u1', email: 'cook@example.com' });
		expect(res.headers.get('cache-control')).toBe('private, no-store');
		expect(auth.verifySessionCookie).toHaveBeenCalledWith('cookie', true);
	});

	it('treats an expired or revoked session as signed out', async () => {
		auth.verifySessionCookie.mockRejectedValue(new Error('expired'));
		const { result } = await run('/recipes', 'old-cookie');
		await expect(result).rejects.toMatchObject({ status: 303, location: '/signin' });
	});

	it('sends a signed-in user away from the sign-in page', async () => {
		auth.verifySessionCookie.mockResolvedValue(validClaims);
		const { result } = await run('/signin', 'cookie');
		await expect(result).rejects.toMatchObject({ status: 303, location: '/recipes' });
	});

	it('ends the session of someone removed from the allowlist', async () => {
		auth.verifySessionCookie.mockResolvedValue(validClaims);
		allow.list = 'someone-else@example.com';
		const { result, cookies } = await run('/recipes', 'cookie');
		await expect(result).rejects.toMatchObject({
			status: 303,
			location: '/signin?reason=not-allowed'
		});
		expect(cookies.delete).toHaveBeenCalledWith('__session', { path: '/' });
	});

	it('lets someone removed from the allowlist still open the sign-in page', async () => {
		auth.verifySessionCookie.mockResolvedValue(validClaims);
		allow.list = '';
		const { result, event } = await run('/signin', 'cookie');
		const res = await result;
		expect(res.status).toBe(200);
		expect(event.locals.userID).toBeNull();
	});

	it('does not touch the Admin SDK when there is no cookie', async () => {
		const { result } = await run('/signin');
		await result;
		expect(auth.verifySessionCookie).not.toHaveBeenCalled();
	});
});
