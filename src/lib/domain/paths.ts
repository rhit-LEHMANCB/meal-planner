/** Pages shown to signed-out visitors. Signed-in users are sent to the recipes page instead. */
export const AUTH_PAGES = ['/signin', '/signup', '/reset'];

export const isAuthPage = (pathname: string) => AUTH_PAGES.includes(pathname);

/** Paths that never need a session: the auth pages and the API (health check, session endpoint). */
export const isPublicPath = (pathname: string) =>
	isAuthPage(pathname) || pathname === '/api' || pathname.startsWith('/api/');
