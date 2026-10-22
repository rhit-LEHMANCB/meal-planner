import { describe, expect, it } from 'vitest';
import { findRecipeJsonLd } from './schema-org';

const page = (json: unknown) =>
	`<html><script type="application/ld+json">${JSON.stringify(json)}</script></html>`;

describe('findRecipeJsonLd', () => {
	it('finds a top-level Recipe', () => {
		expect(findRecipeJsonLd(page({ '@type': 'Recipe', name: 'Chili' }))?.name).toBe('Chili');
	});

	it('finds a Recipe inside @graph', () => {
		const html = page({ '@graph': [{ '@type': 'WebSite' }, { '@type': 'Recipe', name: 'Chili' }] });
		expect(findRecipeJsonLd(html)?.name).toBe('Chili');
	});

	it('returns null when there is no recipe', () => {
		expect(findRecipeJsonLd('<html></html>')).toBeNull();
	});
});
