import { json } from '@sveltejs/kit';
import { getAdminAuth } from '$lib/server/admin';
import { checkAccess, getAllowlist } from '$lib/server/auth';
import { startSession } from '$lib/server/session';

/**
 * Turns a Firebase ID token into a session, but only for an allowlisted, verified email.
 * Failures return a code the sign-in form turns into a message: `invalid`, `not-allowed`, `unverified`.
 */
export const POST = async ({ request, cookies }) => {
	let idToken: unknown;
	try {
		({ idToken } = await request.json());
	} catch {
		return json({ code: 'invalid' }, { status: 400 });
	}
	if (typeof idToken !== 'string' || idToken.length === 0) {
		return json({ code: 'invalid' }, { status: 400 });
	}

	let claims;
	try {
		claims = await getAdminAuth().verifyIdToken(idToken, true);
	} catch {
		return json({ code: 'invalid' }, { status: 401 });
	}

	const rejection = checkAccess(claims, getAllowlist());
	if (rejection) return json({ code: rejection }, { status: 403 });

	await startSession(cookies, idToken, claims.auth_time);
	return json({ ok: true });
};
