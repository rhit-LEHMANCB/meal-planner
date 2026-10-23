import type { ImportDraft } from '$lib/domain/recipe-import';
import { recipeFromJsonLd } from '$lib/domain/schema-org-recipe';
import { getImportUsage, type ImportUsage } from '../import-usage';
import { pageText, PAGE_TEXT_MIN } from './page-text';
import {
	ExtractError,
	extractRecipe,
	type ExtractSource,
	type ImageMediaType
} from './recipe-extract';
import { checkUrl, FetchError, safeFetch, type FetchedPage } from './safe-fetch';
import { findRecipeJsonLd } from './schema-org';

export const TEXT_MAX = 20_000;
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

export type ImportFailure =
	/** Not an http(s) link on a standard port. */
	| 'link-invalid'
	/** Points at an internal or private address. */
	| 'link-refused'
	/** The page could not be loaded or read, or holds no recipe: offer to paste instead. */
	| 'link-unreadable'
	| 'cooldown'
	| 'daily-limit'
	| 'text-empty'
	| 'text-too-long'
	| 'photo-missing'
	| 'photo-type'
	| 'photo-too-large'
	| 'no-recipe'
	| 'unavailable';

export type ImportResult =
	| {
			ok: true;
			draft: ImportDraft;
			/** `structured`: read from the page's schema.org data, no AI used. */
			via: 'structured' | 'ai';
			droppedIngredients: number;
			droppedSteps: number;
	  }
	| { ok: false; reason: ImportFailure };

export interface ImporterDeps {
	usage: Pick<ImportUsage, 'startImport' | 'reserveAi' | 'refundAi'>;
	fetchPage: (url: string) => Promise<FetchedPage>;
	extract: typeof extractRecipe;
}

const fail = (reason: ImportFailure): ImportResult => ({ ok: false, reason });

/** The media type a photo really is, judged by its first bytes rather than its name. */
export const sniffImage = (bytes: Uint8Array): ImageMediaType | null => {
	const starts = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
	if (starts(0xff, 0xd8, 0xff)) return 'image/jpeg';
	if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
	const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
	if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
	return null;
};

/** A source link carried over from a blocked import. Untrusted, so it must still be a valid link. */
const cleanSourceUrl = (value: string | null): string | null => {
	if (!value) return null;
	try {
		checkUrl(value);
		return value.trim();
	} catch {
		return null;
	}
};

/**
 * Runs an import for one user. Input is checked before the cooldown starts, the cooldown before
 * any fetch or model call, and an AI slot is taken just before the model is asked. Nothing is
 * saved: the result is a draft for the review screen.
 */
export const makeImporter = (deps: ImporterDeps) => {
	const withAi = async (
		userId: string,
		source: ExtractSource,
		sourceUrl: string | null
	): Promise<ImportResult> => {
		if (!(await deps.usage.reserveAi(userId))) return fail('daily-limit');
		try {
			const result = await deps.extract(source, sourceUrl);
			return { ok: true, via: 'ai', ...result };
		} catch (error) {
			if (!(error instanceof ExtractError)) {
				// A bug after the call; the model may have been reached, so the slot is kept.
				// Only the message is logged: the source can hold the user's text or photo.
				console.error('Recipe import failed:', (error as Error)?.message);
				return fail('unavailable');
			}
			// Only a request that never reached the model is given back.
			if (!error.reachedModel) await deps.usage.refundAi(userId);
			return fail(error.reason);
		}
	};

	return {
		async fromLink(userId: string, link: string): Promise<ImportResult> {
			try {
				checkUrl(link);
			} catch (error) {
				return fail((error as FetchError).reason === 'refused' ? 'link-refused' : 'link-invalid');
			}
			if (!(await deps.usage.startImport(userId))) return fail('cooldown');

			let page: FetchedPage;
			try {
				page = await deps.fetchPage(link);
			} catch (error) {
				if (error instanceof FetchError && error.reason === 'refused') return fail('link-refused');
				if (error instanceof FetchError && error.reason === 'invalid') return fail('link-invalid');
				return fail('link-unreadable');
			}

			const sourceUrl = link.trim();
			const jsonLd = findRecipeJsonLd(page.html);
			const structured = jsonLd ? recipeFromJsonLd(jsonLd, sourceUrl) : null;
			if (structured) {
				return {
					ok: true,
					via: 'structured',
					draft: structured,
					droppedIngredients: 0,
					droppedSteps: 0
				};
			}

			const text = pageText(page.html);
			if (text.length < PAGE_TEXT_MIN) return fail('link-unreadable');
			return withAi(userId, { kind: 'text', text }, sourceUrl);
		},

		async fromText(userId: string, text: string, sourceUrl: string | null): Promise<ImportResult> {
			const trimmed = text.trim();
			if (trimmed === '') return fail('text-empty');
			if (trimmed.length > TEXT_MAX) return fail('text-too-long');
			if (!(await deps.usage.startImport(userId))) return fail('cooldown');
			return withAi(userId, { kind: 'text', text: trimmed }, cleanSourceUrl(sourceUrl));
		},

		async fromPhoto(userId: string, file: File | null): Promise<ImportResult> {
			if (!file || file.size === 0) return fail('photo-missing');
			if (file.size > PHOTO_MAX_BYTES) return fail('photo-too-large');
			const data = new Uint8Array(await file.arrayBuffer());
			const mediaType = sniffImage(data);
			if (!mediaType) return fail('photo-type');
			if (!(await deps.usage.startImport(userId))) return fail('cooldown');
			// The bytes live only in this request; they are never stored or logged.
			return withAi(userId, { kind: 'image', mediaType, data }, null);
		}
	};
};

export type Importer = ReturnType<typeof makeImporter>;

export const getImporter = (): Importer =>
	makeImporter({
		usage: getImportUsage(),
		fetchPage: (url) => safeFetch(url),
		extract: extractRecipe
	});
