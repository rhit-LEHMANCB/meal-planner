import { error, type Cookies } from '@sveltejs/kit';
import { adminAuth } from './admin';

const EXPIRES_IN = 60 * 60 * 24 * 5 * 1000; // 5 days

/** Exchanges a freshly issued Firebase ID token for the httpOnly `__session` cookie. */
export const setSessionCookie = async (cookies: Cookies, idToken: string) => {
	const decodedIdToken = await adminAuth.verifyIdToken(idToken);

	if (new Date().getTime() / 1000 - decodedIdToken.auth_time >= 5 * 60) {
		throw error(401, 'Recent sign in required!');
	}

	const cookie = await adminAuth.createSessionCookie(idToken, { expiresIn: EXPIRES_IN });
	// maxAge is in seconds; expiresIn is in milliseconds.
	cookies.set('__session', cookie, {
		maxAge: EXPIRES_IN / 1000,
		httpOnly: true,
		secure: true,
		path: '/'
	});
};
