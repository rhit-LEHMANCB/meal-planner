/** 55 -> "55 min", 90 -> "1 h 30 min", 120 -> "2 h". */
export const formatMinutes = (minutes: number): string => {
	if (minutes < 60) return `${minutes} min`;
	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
};

export const formatServings = (servings: number): string =>
	`${servings} ${servings === 1 ? 'serving' : 'servings'}`;

/** "https://www.example.com/a/b" -> "example.com". Null when the text is not a web address. */
export const hostname = (url: string | null): string | null => {
	if (!url) return null;
	try {
		const { protocol, hostname: host } = new URL(url);
		return protocol === 'http:' || protocol === 'https:' ? host.replace(/^www\./, '') : null;
	} catch {
		return null;
	}
};
