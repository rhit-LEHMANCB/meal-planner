import { describe, expect, it } from 'vitest';
import { recipeFromJsonLd } from '$lib/domain/schema-org-recipe';
import { htmlToPlainText } from '$lib/domain/html-text';
import { scanHtml } from './html-scan';
import { pageText } from './page-text';
import { findRecipeJsonLd } from './schema-org';

/** Milliseconds a call takes. */
const time = (fn: () => unknown) => {
	const start = performance.now();
	fn();
	return performance.now() - start;
};

// Hostile pages near the 2 MB fetch cap. Regex scanning took minutes on these; one pass takes ms.
const hostile = {
	'unclosed nav': '<nav>'.repeat(400_000),
	'unclosed comments': '<!--'.repeat(500_000),
	'unclosed json-ld scripts': '<script type="application/ld+json">'.repeat(55_000),
	'unclosed main': '<main>x'.repeat(280_000),
	'lone brackets': '<'.repeat(2_000_000),
	'brackets then one close': '<'.repeat(1_000_000) + '>' + '<a'.repeat(400_000)
};

describe('scanning hostile pages', () => {
	it.each(Object.entries(hostile))('reads %s in linear time', (_, html) => {
		expect(time(() => pageText(html))).toBeLessThan(1500);
		expect(time(() => findRecipeJsonLd(html))).toBeLessThan(1500);
	});

	it('strips tags from long JSON-LD values in linear time', () => {
		const value = '<li'.repeat(600_000);
		expect(time(() => htmlToPlainText(value))).toBeLessThan(500);
		expect(
			time(() => recipeFromJsonLd({ name: value, recipeInstructions: value }, null))
		).toBeLessThan(500);
	});
});

describe('scanHtml', () => {
	it('reads tags, text and raw-text elements', () => {
		const tokens = [
			...scanHtml('<p class="a">Hi<br/></p><script>if (a<b) x("</div>")</script>end')
		];
		expect(tokens).toEqual([
			{ type: 'tag', name: 'p', closing: false, selfClosing: false, raw: '<p class="a">' },
			{ type: 'text', text: 'Hi' },
			{ type: 'tag', name: 'br', closing: false, selfClosing: true, raw: '<br/>' },
			{ type: 'tag', name: 'p', closing: true, selfClosing: false, raw: '</p>' },
			{
				type: 'raw',
				name: 'script',
				openTag: '<script>',
				content: 'if (a<b) x("</div>")'
			},
			{ type: 'text', text: 'end' }
		]);
	});

	it('drops the rest of the page after an unterminated comment or tag', () => {
		expect([...scanHtml('ok<!-- never closed <p>gone')]).toEqual([{ type: 'text', text: 'ok' }]);
		expect([...scanHtml('ok<p class="x gone')]).toEqual([{ type: 'text', text: 'ok' }]);
	});

	it('finds JSON-LD with single, double or no quotes on the type', () => {
		for (const quote of ['"', "'", '']) {
			const html = `<script type=${quote}application/ld+json${quote}>{"@type":"Recipe","name":"Chili"}</script>`;
			expect(findRecipeJsonLd(html)?.name).toBe('Chili');
		}
	});

	it('keeps text inside forms and headers, and nested drops close properly', () => {
		const text = pageText(
			'<header><h1>Chili</h1></header><nav><nav>menu</nav>still menu</nav><form><li>1 lb turkey</li></form>'
		);
		expect(text.split('\n')).toEqual(['Chili', '1 lb turkey']);
	});
});
