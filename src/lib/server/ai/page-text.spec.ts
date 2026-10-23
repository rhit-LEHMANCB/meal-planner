import { describe, expect, it } from 'vitest';
import { PAGE_TEXT_MAX, pageText } from './page-text';

const filler = 'Ground turkey and beans simmered with spices. '.repeat(6);

describe('pageText', () => {
	it('drops scripts, styles, navigation, footers and comments', () => {
		const text = pageText(`<html><head><title>Chili</title><style>.a{}</style></head><body>
			<nav>Home | Recipes</nav><!-- tracking -->
			<h1>Turkey Chili</h1><p>${filler}</p>
			<script>window.ads = 1</script><footer>© Site</footer></body></html>`);
		expect(text).toContain('Chili');
		expect(text).toContain('Turkey Chili');
		expect(text).not.toMatch(/Home \| Recipes|tracking|window\.ads|© Site|\.a\{\}/);
	});

	it('prefers the main content when it has enough text', () => {
		const text = pageText(
			`<body><div>Sidebar promo</div><main><h1>Chili</h1><p>${filler}</p></main></body>`
		);
		expect(text).toContain('Chili');
		expect(text).not.toContain('Sidebar promo');
	});

	it('keeps block structure as lines and decodes entities', () => {
		const text = pageText('<ul><li>1 &frac12; cups rice</li><li>Salt &amp; pepper</li></ul>');
		expect(text.split('\n')).toEqual(['1 ½ cups rice', 'Salt & pepper']);
	});

	it('cuts long pages to the limit', () => {
		expect(pageText(`<p>${'word '.repeat(20_000)}</p>`)).toHaveLength(PAGE_TEXT_MAX);
	});
});
