import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({ env: {} }));

import { makeImporter, sniffImage, TEXT_MAX } from './import';
import { ExtractError } from './recipe-extract';
import { FetchError } from './safe-fetch';

const USER = 'user-1';
const filler = '<p>Brown the turkey, add beans and simmer slowly for half an hour.</p>'.repeat(5);
const jsonLdPage = `<script type="application/ld+json">${JSON.stringify({
	'@type': 'Recipe',
	name: 'Chili',
	recipeIngredient: ['1 lb turkey']
})}</script>`;

const draft = {
	title: 'Soup',
	servings: 4,
	totalMinutes: null,
	sourceUrl: null,
	ingredients: [],
	steps: ['Boil.']
};

const setup = () => {
	const usage = {
		startImport: vi.fn(async () => true),
		reserveAi: vi.fn(async () => true),
		refundAi: vi.fn(async () => {})
	};
	const fetchPage = vi.fn(async (url: string) => ({ url, html: `<main>${filler}</main>` }));
	const extract = vi.fn(async (_source: unknown, sourceUrl: string | null) => ({
		draft: { ...draft, sourceUrl },
		droppedIngredients: 0,
		droppedSteps: 0
	}));
	return { usage, fetchPage, extract, importer: makeImporter({ usage, fetchPage, extract }) };
};

let t: ReturnType<typeof setup>;
beforeEach(() => {
	t = setup();
});

const jpeg = (size = 10) => {
	const bytes = new Uint8Array(size);
	bytes.set([0xff, 0xd8, 0xff]);
	return new File([bytes], 'card.jpg', { type: 'image/jpeg' });
};

describe('links', () => {
	it('imports schema.org data without the model or a slot', async () => {
		t.fetchPage.mockResolvedValue({ url: 'https://example.com/chili', html: jsonLdPage });
		const result = await t.importer.fromLink(USER, 'https://example.com/chili');
		expect(result).toMatchObject({
			ok: true,
			via: 'structured',
			draft: { title: 'Chili', sourceUrl: 'https://example.com/chili' }
		});
		expect(t.usage.reserveAi).not.toHaveBeenCalled();
		expect(t.extract).not.toHaveBeenCalled();
	});

	it('sends page text to the model when there is no structured data, keeping the link', async () => {
		const result = await t.importer.fromLink(USER, 'https://example.com/chili');
		expect(result).toMatchObject({
			ok: true,
			via: 'ai',
			draft: { sourceUrl: 'https://example.com/chili' }
		});
		expect(t.usage.reserveAi).toHaveBeenCalledWith(USER);
		expect(t.extract).toHaveBeenCalledWith(
			{ kind: 'text', text: expect.stringContaining('Brown the turkey') },
			'https://example.com/chili'
		);
	});

	it('refuses bad and internal links before the cooldown or any fetch', async () => {
		expect(await t.importer.fromLink(USER, 'ftp://example.com')).toEqual({
			ok: false,
			reason: 'link-invalid'
		});
		expect(await t.importer.fromLink(USER, 'http://169.254.169.254/')).toEqual({
			ok: false,
			reason: 'link-refused'
		});
		expect(t.usage.startImport).not.toHaveBeenCalled();
		expect(t.fetchPage).not.toHaveBeenCalled();
	});

	it('reports a host resolving to a private address as refused', async () => {
		t.fetchPage.mockRejectedValue(new FetchError('refused'));
		expect(await t.importer.fromLink(USER, 'https://sneaky.example/')).toEqual({
			ok: false,
			reason: 'link-refused'
		});
	});

	it.each(['blocked', 'timeout', 'too-large', 'not-html', 'redirects', 'unreachable'] as const)(
		'offers to paste instead when the fetch fails with %s, without using a slot',
		async (reason) => {
			t.fetchPage.mockRejectedValue(new FetchError(reason));
			expect(await t.importer.fromLink(USER, 'https://example.com/')).toEqual({
				ok: false,
				reason: 'link-unreadable'
			});
			expect(t.usage.reserveAi).not.toHaveBeenCalled();
		}
	);

	it('offers to paste instead when the model finds no recipe on the page', async () => {
		t.extract.mockRejectedValueOnce(new ExtractError('no-recipe', true));
		expect(await t.importer.fromLink(USER, 'https://example.com/')).toEqual({
			ok: false,
			reason: 'link-unreadable'
		});
	});

	it('does not call the model for a page with almost no text', async () => {
		t.fetchPage.mockResolvedValue({ url: 'https://example.com/', html: '<p>Loading…</p>' });
		expect(await t.importer.fromLink(USER, 'https://example.com/')).toEqual({
			ok: false,
			reason: 'link-unreadable'
		});
		expect(t.extract).not.toHaveBeenCalled();
	});
});

describe('limits', () => {
	it('stops during the cooldown before fetching or calling the model', async () => {
		t.usage.startImport.mockResolvedValue(false);
		expect(await t.importer.fromLink(USER, 'https://example.com/')).toEqual({
			ok: false,
			reason: 'cooldown'
		});
		expect(await t.importer.fromText(USER, 'Soup recipe', null)).toEqual({
			ok: false,
			reason: 'cooldown'
		});
		expect(t.fetchPage).not.toHaveBeenCalled();
		expect(t.usage.reserveAi).not.toHaveBeenCalled();
	});

	it('stops at the daily limit without calling the model', async () => {
		t.usage.reserveAi.mockResolvedValue(false);
		expect(await t.importer.fromText(USER, 'Soup recipe', null)).toEqual({
			ok: false,
			reason: 'daily-limit'
		});
		expect(t.extract).not.toHaveBeenCalled();
	});

	it('still imports structured data at the daily limit', async () => {
		t.usage.reserveAi.mockResolvedValue(false);
		t.fetchPage.mockResolvedValue({ url: 'https://example.com/', html: jsonLdPage });
		expect(await t.importer.fromLink(USER, 'https://example.com/')).toMatchObject({ ok: true });
	});

	it('refunds the slot only when the request never reached the model', async () => {
		t.extract.mockRejectedValueOnce(new ExtractError('unavailable', false));
		expect(await t.importer.fromText(USER, 'Soup', null)).toEqual({
			ok: false,
			reason: 'unavailable'
		});
		expect(t.usage.refundAi).toHaveBeenCalledTimes(1);

		t.extract.mockRejectedValueOnce(new ExtractError('no-recipe', true));
		expect(await t.importer.fromText(USER, 'Soup', null)).toEqual({
			ok: false,
			reason: 'no-recipe'
		});
		expect(t.usage.refundAi).toHaveBeenCalledTimes(1);
	});
});

describe('unexpected errors', () => {
	it('report import as unavailable instead of failing the request, keeping the slot', async () => {
		const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
		t.extract.mockRejectedValueOnce(new TypeError('boom'));
		expect(await t.importer.fromText(USER, 'Soup', null)).toEqual({
			ok: false,
			reason: 'unavailable'
		});
		expect(t.usage.refundAi).not.toHaveBeenCalled();
		quiet.mockRestore();
	});
});

describe('pasted text', () => {
	it('refuses empty or too long text before the cooldown', async () => {
		expect(await t.importer.fromText(USER, '   ', null)).toEqual({
			ok: false,
			reason: 'text-empty'
		});
		expect(await t.importer.fromText(USER, 'x'.repeat(TEXT_MAX + 1), null)).toEqual({
			ok: false,
			reason: 'text-too-long'
		});
		expect(t.usage.startImport).not.toHaveBeenCalled();
	});

	it('keeps a carried-over link only when it is a valid public link', async () => {
		await t.importer.fromText(USER, 'Soup', 'https://example.com/soup');
		expect(t.extract).toHaveBeenLastCalledWith(expect.anything(), 'https://example.com/soup');
		await t.importer.fromText(USER, 'Soup', 'javascript:alert(1)');
		expect(t.extract).toHaveBeenLastCalledWith(expect.anything(), null);
	});
});

describe('photos', () => {
	it('sends a real JPEG to the model as an image', async () => {
		expect(await t.importer.fromPhoto(USER, jpeg())).toMatchObject({ ok: true });
		expect(t.extract).toHaveBeenCalledWith(
			{ kind: 'image', mediaType: 'image/jpeg', data: expect.any(Uint8Array) },
			null
		);
	});

	it('refuses missing, oversized and non-image files before the cooldown', async () => {
		const renamedText = new File(['just some text'], 'card.jpg', { type: 'image/jpeg' });
		expect(await t.importer.fromPhoto(USER, null)).toEqual({ ok: false, reason: 'photo-missing' });
		expect(await t.importer.fromPhoto(USER, renamedText)).toEqual({
			ok: false,
			reason: 'photo-type'
		});
		expect(await t.importer.fromPhoto(USER, jpeg(5 * 1024 * 1024 + 1))).toEqual({
			ok: false,
			reason: 'photo-too-large'
		});
		expect(t.usage.startImport).not.toHaveBeenCalled();
	});
});

describe('sniffImage', () => {
	it('reads the type from the first bytes', () => {
		expect(sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(
			'image/png'
		);
		expect(sniffImage(new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp');
		expect(sniffImage(new TextEncoder().encode('%PDF-1.7'))).toBeNull();
		expect(sniffImage(new TextEncoder().encode('ftypheic'))).toBeNull();
	});
});
