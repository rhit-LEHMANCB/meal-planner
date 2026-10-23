import { decodeEntities } from '$lib/domain/html-text';

/** At most this much page text goes to the model. */
export const PAGE_TEXT_MAX = 30_000;

/** Pages with less readable text than this have no recipe worth a model call. */
export const PAGE_TEXT_MIN = 200;

const DROP_BLOCKS =
	/<(script|style|noscript|svg|template|iframe|object|nav|footer|aside|select|button)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const BLOCK_TAGS =
	/<\/?(br|p|div|li|ul|ol|h[1-6]|tr|td|th|table|section|article|header|main|dd|dt)\b[^>]*>/gi;

const textOf = (html: string) =>
	decodeEntities(html.replace(BLOCK_TAGS, '\n').replace(/<[^>]*>/g, ' '))
		.split('\n')
		.map((line) => line.replace(/\s+/g, ' ').trim())
		.filter(Boolean)
		.join('\n');

/**
 * The readable text of a page for the model: scripts, styles, navigation, footers and comments
 * removed, the `<main>` or `<article>` part preferred when it holds enough text, block tags as
 * line breaks, entities decoded, cut to PAGE_TEXT_MAX characters.
 */
export const pageText = (html: string): string => {
	const cleaned = html.replace(/<!--[\s\S]*?-->/g, ' ').replace(DROP_BLOCKS, ' ');
	const title = textOf(cleaned.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '');

	let body = cleaned.match(/<body\b[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? cleaned;
	for (const tag of ['main', 'article']) {
		const part = cleaned.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*)</${tag}>`, 'i'))?.[1];
		if (part && textOf(part).length >= PAGE_TEXT_MIN) {
			body = part;
			break;
		}
	}
	body = body.replace(/<head\b[^>]*>[\s\S]*?<\/head>/i, ' ');

	const text = [title, textOf(body)].filter(Boolean).join('\n');
	return text.slice(0, PAGE_TEXT_MAX);
};
