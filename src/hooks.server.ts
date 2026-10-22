import { adminAuth } from '#lib/server/admin.ts';
import { redirect } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit/hooks';

export const handle = (async ({ event, resolve }) => {
	const sessionCookie = event.cookies.get('__session');

	event.locals.userID = null;

	try {
		const decodedClaims = await adminAuth.verifySessionCookie(sessionCookie ?? '');
		event.locals.userID = decodedClaims.uid;
	} catch {
		if (isAuthenticationRequired(event.url.pathname)) {
			throw redirect(303, '/signin');
		}
	}

	return resolve(event);
}) satisfies Handle;

function isAuthenticationRequired(pathname: string) {
	return pathname !== '/signin' && !pathname.startsWith('/api');
}
