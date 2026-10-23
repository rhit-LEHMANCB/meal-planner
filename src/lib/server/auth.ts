import { env } from '$env/dynamic/private';
import { isAllowed, parseAllowlist } from '$lib/domain/allowlist';

export type AccessRejection = 'not-allowed' | 'unverified';

/** The configured allowlist, read at request time because it is a runtime secret. */
export const getAllowlist = () => parseAllowlist(env.ALLOWED_EMAILS);

/**
 * Decides whether a verified Firebase identity may use the app. Returns why not, or null if allowed.
 * The allowlist is checked first so an uninvited address never learns anything about its verification state.
 */
export const checkAccess = (
	claims: { email?: string; email_verified?: boolean },
	allowlist: readonly string[]
): AccessRejection | null => {
	if (!isAllowed(claims.email, allowlist)) return 'not-allowed';
	if (claims.email_verified !== true) return 'unverified';
	return null;
};

/** Pages a signed-out visitor can open. Everything else needs a session. */
const AUTH_PAGES = ['/signin', '/signup', '/reset'];

export const isAuthPage = (pathname: string) => AUTH_PAGES.includes(pathname);

export const isPublicPath = (pathname: string) =>
	isAuthPage(pathname) || pathname === '/api' || pathname.startsWith('/api/');
