import { describe, expect, it, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({ env: { ALLOWED_EMAILS: 'Cook@Example.com' } }));

import { checkAccess, getAllowlist } from './auth';

describe('checkAccess', () => {
	const list = ['cook@example.com'];

	it('allows an allowlisted, verified email', () => {
		expect(checkAccess({ email: 'cook@example.com', email_verified: true }, list)).toBeNull();
	});

	it('rejects an unverified email', () => {
		expect(checkAccess({ email: 'cook@example.com', email_verified: false }, list)).toBe(
			'unverified'
		);
		expect(checkAccess({ email: 'cook@example.com' }, list)).toBe('unverified');
	});

	it('rejects an email that is not allowlisted before looking at verification', () => {
		expect(checkAccess({ email: 'stranger@example.com', email_verified: false }, list)).toBe(
			'not-allowed'
		);
		expect(checkAccess({ email: 'stranger@example.com', email_verified: true }, list)).toBe(
			'not-allowed'
		);
	});
});

describe('getAllowlist', () => {
	it('reads and normalizes ALLOWED_EMAILS', () => {
		expect(getAllowlist()).toEqual(['cook@example.com']);
	});
});
