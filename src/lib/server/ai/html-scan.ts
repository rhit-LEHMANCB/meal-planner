// A small HTML tokenizer that reads a page in one forward pass. Fetched pages are untrusted, and
// regexes such as `<nav>[\s\S]*?</nav>` take quadratic time on many unclosed tags, so all page
// scanning goes through this instead. Every step moves forward; nothing is scanned twice.

export type HtmlToken =
	| { type: 'text'; text: string }
	| { type: 'tag'; name: string; closing: boolean; selfClosing: boolean; raw: string }
	/** The whole content of a raw-text element (script, style ...), read up to its closing tag. */
	| { type: 'raw'; name: string; openTag: string; content: string };

const RAW_TEXT = new Set(['script', 'style', 'noscript', 'template', 'textarea', 'title', 'xmp']);
/** A tag name right at the "<" (sticky: it never searches ahead). */
const TAG_NAME = /<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9-]*)/y;

/**
 * Lower-cases ASCII letters only. `toLowerCase()` can change the length of a string ("İ"
 * becomes two characters), which would shift every offset taken from the copy.
 */
const asciiLower = (text: string) => text.replace(/[A-Z]+/g, (run) => run.toLowerCase());

/**
 * Splits HTML into text, tags and raw-text elements. An unterminated comment, tag or raw-text
 * element ends the scan: the rest of the page is dropped rather than guessed at.
 */
export function* scanHtml(html: string): Generator<HtmlToken> {
	const lower = asciiLower(html);
	const n = html.length;
	let pos = 0;

	/** The ">" that ends a tag, skipping any inside quoted attribute values; -1 if none. */
	const tagEnd = (from: number) => {
		let i = from;
		while (i < n) {
			const c = html[i];
			if (c === '>') return i;
			if (c === '"' || c === "'") {
				const close = html.indexOf(c, i + 1);
				if (close === -1) return -1;
				i = close + 1;
			} else i++;
		}
		return -1;
	};

	while (pos < n) {
		const lt = html.indexOf('<', pos);
		if (lt === -1) {
			yield { type: 'text', text: html.slice(pos) };
			return;
		}
		if (lt > pos) yield { type: 'text', text: html.slice(pos, lt) };

		if (html.startsWith('<!--', lt)) {
			const end = html.indexOf('-->', lt + 4);
			if (end === -1) return;
			pos = end + 3;
			continue;
		}

		TAG_NAME.lastIndex = lt;
		const match = TAG_NAME.exec(html);
		if (!match) {
			// "<3", "< 2 cups" and the like: only the "<" is text; a real tag may follow.
			yield { type: 'text', text: '<' };
			pos = lt + 1;
			continue;
		}

		const gt = tagEnd(lt + match[0].length);
		if (gt === -1) return;
		const raw = html.slice(lt, gt + 1);
		pos = gt + 1;

		const name = match[2].toLowerCase();
		const closing = match[1] === '/';
		const selfClosing = raw.endsWith('/>');

		if (!closing && !selfClosing && RAW_TEXT.has(name)) {
			const close = lower.indexOf(`</${name}`, pos);
			if (close === -1) return;
			yield { type: 'raw', name, openTag: raw, content: html.slice(pos, close) };
			const closeEnd = html.indexOf('>', close);
			if (closeEnd === -1) return;
			pos = closeEnd + 1;
			continue;
		}
		yield { type: 'tag', name, closing, selfClosing, raw };
	}
}
