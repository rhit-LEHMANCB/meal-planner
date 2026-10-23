const NAMED_ENTITIES: Record<string, string> = {
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
	nbsp: ' ',
	ndash: '–',
	mdash: '—',
	hellip: '…',
	rsquo: '’',
	lsquo: '‘',
	rdquo: '”',
	ldquo: '“',
	deg: '°',
	frac12: '½',
	frac14: '¼',
	frac34: '¾',
	times: '×',
	eacute: 'é',
	egrave: 'è',
	ntilde: 'ñ',
	uuml: 'ü',
	ouml: 'ö',
	auml: 'ä'
};

/** Decodes HTML character references (&amp;, &#189;, &#x00BD;). Unknown names are left as written. */
export const decodeEntities = (text: string): string =>
	text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (whole, ref: string) => {
		if (ref[0] === '#') {
			const code =
				ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : Number(ref.slice(1));
			return Number.isFinite(code) && code > 0 && code <= 0x10ffff
				? String.fromCodePoint(code)
				: whole;
		}
		return NAMED_ENTITIES[ref.toLowerCase()] ?? whole;
	});

/**
 * Plain text from a fragment of HTML: tags removed, entities decoded, whitespace collapsed.
 * The tag pattern stops at the next "<", so many unclosed tags cannot make it slow.
 */
export const htmlToPlainText = (html: string): string =>
	decodeEntities(html.replace(/<br\s*\/?>/gi, ' ').replace(/<[^<>]*>/g, ' '))
		.replace(/\s+/g, ' ')
		.trim();
