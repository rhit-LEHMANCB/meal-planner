import { decodeEntities } from '$lib/domain/html-text';
import { scanHtml } from './html-scan';

/** At most this much page text goes to the model. */
export const PAGE_TEXT_MAX = 30_000;

/** Pages with less readable text than this have no recipe worth a model call. */
export const PAGE_TEXT_MIN = 200;

/** Elements whose content is never recipe text. `header` and `form` are kept: recipe cards sit in them. */
const DROP = new Set(['svg', 'iframe', 'object', 'nav', 'footer', 'aside', 'select', 'button']);
const BLOCK = new Set([
	'br',
	'p',
	'div',
	'li',
	'ul',
	'ol',
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	'tr',
	'td',
	'th',
	'table',
	'section',
	'article',
	'header',
	'main',
	'dd',
	'dt'
]);

const textOf = (html: string) =>
	decodeEntities(html)
		.split('\n')
		.map((line) => line.replace(/\s+/g, ' ').trim())
		.filter(Boolean)
		.join('\n');

/** Where a `<main>` or `<article>` sits in the collected text, by segment index. */
interface Region {
	start: number;
	end: number | null;
	depth: number;
}

/**
 * The readable text of a page for the model, in one forward pass: scripts, styles, navigation,
 * footers, comments and the head removed, the `<main>` or `<article>` part preferred when it
 * holds enough text, block tags as line breaks, entities decoded, cut to PAGE_TEXT_MAX.
 */
export const pageText = (html: string): string => {
	const segments: string[] = [];
	const regions: Record<'main' | 'article', Region | null> = { main: null, article: null };
	let title = '';
	let skipping: { name: string; depth: number } | null = null;
	let inHead = false;

	for (const token of scanHtml(html)) {
		if (token.type === 'raw') {
			if (token.name === 'title' && !title) title = token.content;
			continue;
		}
		if (token.type === 'text') {
			if (!skipping && !inHead) segments.push(token.text);
			continue;
		}

		const { name, closing, selfClosing } = token;
		if (skipping) {
			if (name === skipping.name && !selfClosing) skipping.depth += closing ? -1 : 1;
			if (skipping.depth === 0) skipping = null;
			continue;
		}
		if (!closing && !selfClosing && DROP.has(name)) {
			skipping = { name, depth: 1 };
			continue;
		}
		if (name === 'head') {
			inHead = !closing;
			continue;
		}
		if (name === 'body' && !closing) inHead = false;

		if (name === 'main' || name === 'article') {
			const region = regions[name];
			if (!closing && !region) regions[name] = { start: segments.length, end: null, depth: 1 };
			else if (region && region.end === null) {
				region.depth += closing ? -1 : 1;
				if (region.depth === 0) region.end = segments.length;
			}
		}
		if (BLOCK.has(name)) segments.push('\n');
	}

	let body = textOf(segments.join(''));
	for (const region of [regions.main, regions.article]) {
		if (!region) continue;
		const part = textOf(segments.slice(region.start, region.end ?? segments.length).join(''));
		if (part.length >= PAGE_TEXT_MIN) {
			body = part;
			break;
		}
	}

	return [textOf(title), body].filter(Boolean).join('\n').slice(0, PAGE_TEXT_MAX);
};
