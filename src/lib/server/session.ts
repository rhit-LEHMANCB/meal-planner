import { error, type Cookies } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { getAdminAuth } from './admin';

// App Hosting's CDN only forwards a cookie named `__session`.
export const SESSION_COOKIE = '__session';

const EXPIRES_IN = 60 * 60 * 24 * 5 * 1000; // 5 days

/**
 * Exchanges a freshly issued Firebase ID token for the httpOnly session cookie.
 * `authTime` is the token's `auth_time` (seconds): the sign-in must be recent.
 */
export const startSession = async (cookies: Cookies, idToken: string, authTime: number) => {
	if (new Date().getTime() / 1000 - authTime >= 5 * 60) {
		throw error(401, 'Recent sign in required!');
	}

	const cookie = await getAdminAuth().createSessionCookie(idToken, { expiresIn: EXPIRES_IN });
	// maxAge is in seconds; expiresIn is in milliseconds.
	cookies.set(SESSION_COOKIE, cookie, {
		maxAge: EXPIRES_IN / 1000,
		httpOnly: true,
		secure: !dev,
		sameSite: 'lax',
		path: '/'
	});
};

export const endSession = (cookies: Cookies) => {
	cookies.delete(SESSION_COOKIE, { path: '/' });
};
