// A small HTML tokenizer that reads a page in one forward pass. Fetched pages are untrusted, and
// regexes such as `<nav>[\s\S]*?</nav>` take quadratic time on many unclosed tags, so all page
// scanning goes through this instead. Every step moves forward; nothing is scanned twice.

export type HtmlToken =
	| { type: 'text'; text: string }
	| { type: 'tag'; name: string; closing: boolean; selfClosing: boolean; raw: string }
	/** The whole content of a raw-text element (script, style ...), read up to its closing tag. */
	| { type: 'raw'; name: string; openTag: string; content: string };

const RAW_TEXT = new Set(['script', 'style', 'noscript', 'template', 'textarea', 'title', 'xmp']);
const TAG_NAME = /^<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9-]*)/;

/**
 * Splits HTML into text, tags and raw-text elements. An unterminated comment, tag or raw-text
 * element ends the scan: the rest of the page is dropped rather than guessed at.
 */
export function* scanHtml(html: string): Generator<HtmlToken> {
	const lower = html.toLowerCase();
	const n = html.length;
	let pos = 0;

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

		const gt = html.indexOf('>', lt + 1);
		if (gt === -1) return;
		const raw = html.slice(lt, gt + 1);
		pos = gt + 1;

		const match = TAG_NAME.exec(raw);
		if (!match) {
			// "<3", "< b" and the like: plain text, and the scan moves past it.
			yield { type: 'text', text: raw };
			continue;
		}
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
