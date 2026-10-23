import { scanHtml } from './html-scan';

/** Pulls a schema.org Recipe out of a page's JSON-LD blocks. Free and accurate when present, so try it before the model. */
export const findRecipeJsonLd = (html: string): Record<string, unknown> | null => {
	for (const token of scanHtml(html)) {
		if (token.type !== 'raw' || token.name !== 'script') continue;
		// A real `type` attribute, not `data-type=` or `mimetype=`.
		if (!/\stype\s*=\s*["']?application\/ld\+json/i.test(token.openTag)) continue;
		try {
			const found = collectRecipes(JSON.parse(token.content), 0);
			if (found) return found;
		} catch {
			// Ignore blocks that are not valid JSON.
		}
	}
	return null;
};

/** Finds a Recipe in a JSON-LD value, inside arrays, `@graph` or `mainEntity`, a few levels deep. */
const collectRecipes = (node: unknown, depth: number): Record<string, unknown> | null => {
	if (depth > 8) return null;
	if (Array.isArray(node)) {
		for (const item of node) {
			const found = collectRecipes(item, depth + 1);
			if (found) return found;
		}
		return null;
	}
	if (node && typeof node === 'object') {
		const obj = node as Record<string, unknown>;
		const type = obj['@type'];
		if (type === 'Recipe' || (Array.isArray(type) && type.includes('Recipe'))) return obj;
		return collectRecipes(obj['@graph'], depth + 1) ?? collectRecipes(obj.mainEntity, depth + 1);
	}
	return null;
};
