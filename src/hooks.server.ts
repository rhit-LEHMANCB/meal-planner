import { getAdminAuth } from '$lib/server/admin';
import { redirect, type Handle } from '@sveltejs/kit';

export const handle = (async ({ event, resolve }) => {
	const sessionCookie = event.cookies.get('__session');

	event.locals.userID = null;

	try {
		const decodedClaims = await getAdminAuth().verifySessionCookie(sessionCookie ?? '');
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
