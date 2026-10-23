import { getAdminAuth } from '$lib/server/admin';
import { checkAccess, getAllowlist, isAuthPage, isPublicPath } from '$lib/server/auth';
import { endSession, SESSION_COOKIE } from '$lib/server/session';
import { redirect, type Handle } from '@sveltejs/kit';

export const handle = (async ({ event, resolve }) => {
	event.locals.userID = null;
	event.locals.email = null;

	const sessionCookie = event.cookies.get(SESSION_COOKIE);
	let rejected = false;

	if (sessionCookie) {
		try {
			// checkRevoked: a password reset or revoked token ends the session.
			const claims = await getAdminAuth().verifySessionCookie(sessionCookie, true);
			// The allowlist is re-applied on every request, so removing an email takes effect immediately.
			if (checkAccess(claims, getAllowlist())) {
				rejected = true;
			} else {
				event.locals.userID = claims.uid;
				event.locals.email = claims.email ?? null;
			}
		} catch {
			// Missing, expired or revoked session: treated as signed out.
		}
	}

	const { pathname } = event.url;

	if (rejected) {
		endSession(event.cookies);
		if (!isPublicPath(pathname)) throw redirect(303, '/signin?reason=not-allowed');
	}
	if (!event.locals.userID && !isPublicPath(pathname)) throw redirect(303, '/signin');
	if (event.locals.userID && isAuthPage(pathname)) throw redirect(303, '/recipes');

	const response = await resolve(event);
	// The CDN must never cache a page that depends on the session cookie.
	if (!response.headers.has('cache-control')) {
		response.headers.set('cache-control', 'private, no-store');
	}
	return response;
}) satisfies Handle;
