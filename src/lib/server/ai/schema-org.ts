import { scanHtml } from './html-scan';

/** Pulls a schema.org Recipe out of a page's JSON-LD blocks. Free and accurate when present, so try it before the model. */
export const findRecipeJsonLd = (html: string): Record<string, unknown> | null => {
	for (const token of scanHtml(html)) {
		if (token.type !== 'raw' || token.name !== 'script') continue;
		if (!/type\s*=\s*["']?application\/ld\+json/i.test(token.openTag)) continue;
		try {
			const found = collectRecipes(JSON.parse(token.content));
			if (found) return found;
		} catch {
			// Ignore blocks that are not valid JSON.
		}
	}
	return null;
};

const collectRecipes = (node: unknown): Record<string, unknown> | null => {
	if (Array.isArray(node)) {
		for (const item of node) {
			const found = collectRecipes(item);
			if (found) return found;
		}
		return null;
	}
	if (node && typeof node === 'object') {
		const obj = node as Record<string, unknown>;
		const type = obj['@type'];
		if (type === 'Recipe' || (Array.isArray(type) && type.includes('Recipe'))) return obj;
		return collectRecipes(obj['@graph']);
	}
	return null;
};
