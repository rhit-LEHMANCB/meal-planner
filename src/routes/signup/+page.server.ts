import { fail } from '@sveltejs/kit';
import { isAllowed } from '$lib/domain/allowlist';
import { getAdminAuth } from '$lib/server/admin';
import { getAllowlist } from '$lib/server/auth';

const MIN_PASSWORD_LENGTH = 8;

export const actions = {
	/**
	 * Accounts are only created here, after the allowlist check, so strangers cannot create
	 * Firebase accounts (or trigger Firebase emails) from the browser.
	 */
	default: async ({ request }) => {
		const form = await request.formData();
		const email = String(form.get('email') ?? '')
			.trim()
			.toLowerCase();
		const password = String(form.get('password') ?? '');

		if (!isAllowed(email, getAllowlist())) {
			return fail(403, { reason: 'not-invited' as const, email });
		}
		if (password.length < MIN_PASSWORD_LENGTH) {
			return fail(400, { reason: 'weak-password' as const, email });
		}

		try {
			await getAdminAuth().createUser({ email, password, emailVerified: false });
		} catch (err) {
			const code = (err as { code?: string }).code;
			if (code === 'auth/email-already-exists') {
				return fail(409, { reason: 'exists' as const, email });
			}
			console.error('Sign-up failed', err);
			return fail(500, { reason: 'error' as const, email });
		}

		return { created: true as const, email };
	}
};
