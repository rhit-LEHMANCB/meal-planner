const normalize = (email: string) => email.trim().toLowerCase();

/** Turns the comma-separated `ALLOWED_EMAILS` value into a list of normalized addresses. */
export const parseAllowlist = (raw: string | undefined | null): string[] =>
	(raw ?? '')
		.split(',')
		.map(normalize)
		.filter((email) => email.length > 0);

/** True when `email` is on the allowlist. Ignores letter case and surrounding spaces. An empty list allows nobody. */
export const isAllowed = (email: string | undefined | null, allowlist: readonly string[]): boolean =>
	!!email && allowlist.includes(normalize(email));
