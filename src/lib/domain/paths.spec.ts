import { describe, expect, it } from 'vitest';
import { isAuthPage, isPublicPath } from './paths';

describe('paths', () => {
	it('treats the auth pages and the API as public', () => {
		for (const p of ['/signin', '/signup', '/reset', '/api/health', '/api/session']) {
			expect(isPublicPath(p), p).toBe(true);
		}
	});

	it('protects everything else', () => {
		for (const p of ['/', '/recipes', '/recipes/new', '/signout', '/apiary', '/signin/extra']) {
			expect(isPublicPath(p), p).toBe(false);
		}
	});

	it('knows which pages signed-in users are bounced from', () => {
		expect(isAuthPage('/signin')).toBe(true);
		expect(isAuthPage('/recipes')).toBe(false);
	});
});
