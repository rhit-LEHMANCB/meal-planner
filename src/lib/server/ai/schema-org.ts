/** Pulls a schema.org Recipe out of a page's JSON-LD blocks. Free and accurate when present, so try it before the model. */
export const findRecipeJsonLd = (html: string): Record<string, unknown> | null => {
	const blocks = html.matchAll(
		/<script[^>]*type=["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi
	);
	for (const [, raw] of blocks) {
		try {
			const found = collectRecipes(JSON.parse(raw));
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
