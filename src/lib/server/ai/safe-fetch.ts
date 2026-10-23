import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import type { LookupFunction } from 'node:net';
import type { Readable } from 'node:stream';
import zlib from 'node:zlib';
import { isIpLiteral, isPublicAddress } from '$lib/domain/ip-address';

/** Why a page could not be fetched. `invalid` and `refused` happen before any request is made. */
export type FetchFailure =
	| 'invalid'
	| 'refused'
	| 'redirects'
	| 'blocked'
	| 'unreachable'
	| 'timeout'
	| 'too-large'
	| 'not-html';

export class FetchError extends Error {
	constructor(readonly reason: FetchFailure) {
		super(`Page fetch failed: ${reason}`);
	}
}

export interface SafeFetchOptions {
	timeoutMs?: number;
	maxBytes?: number;
	maxRedirects?: number;
	/** Tests only: a different address policy. Production uses `isPublicAddress`. */
	isAllowedAddress?: (address: string) => boolean;
	/** Tests only: allow any port. Production allows only 80 and 443. */
	anyPort?: boolean;
	/** Tests only: a different resolver. Production uses the system resolver. */
	resolve?: (hostname: string) => Promise<{ address: string; family: number }[]>;
}

export interface FetchedPage {
	/** The final address, after redirects. */
	url: string;
	html: string;
}

const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const HTML_TYPES = ['text/html', 'application/xhtml+xml'];

const systemResolve = (hostname: string) =>
	dns.promises.lookup(hostname, { all: true, verbatim: true });

/**
 * Checks a link before anything is fetched: http or https, standard port, no user name or
 * password, and an IP literal must be public. Returns the parsed URL.
 */
export const checkUrl = (raw: string, options: SafeFetchOptions = {}): URL => {
	let url: URL;
	try {
		url = new URL(raw.trim());
	} catch {
		throw new FetchError('invalid');
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new FetchError('invalid');
	if (url.username || url.password) throw new FetchError('invalid');
	if (!options.anyPort && url.port !== '' && url.port !== '80' && url.port !== '443') {
		throw new FetchError('invalid');
	}
	if (!url.hostname) throw new FetchError('invalid');
	const allowed = options.isAllowedAddress ?? isPublicAddress;
	if (isIpLiteral(url.hostname) && !allowed(url.hostname)) throw new FetchError('refused');
	return url;
};

/**
 * A lookup that refuses the whole host if any of its addresses is not allowed, and hands the
 * socket only vetted addresses. The connection goes to the address that was checked, so DNS
 * rebinding between check and connect cannot reach an internal address.
 */
const vettedLookup =
	(options: SafeFetchOptions): LookupFunction =>
	(hostname, lookupOptions, callback) => {
		const allowed = options.isAllowedAddress ?? isPublicAddress;
		(options.resolve ?? systemResolve)(hostname).then(
			(addresses) => {
				if (addresses.length === 0) {
					callback(new FetchError('unreachable'), '', 4);
				} else if (addresses.some((a) => !allowed(a.address))) {
					callback(new FetchError('refused'), '', 4);
				} else if (lookupOptions.all) {
					(callback as unknown as (e: null, a: typeof addresses) => void)(null, addresses);
				} else {
					callback(null, addresses[0].address, addresses[0].family);
				}
			},
			() => callback(new FetchError('unreachable'), '', 4)
		);
	};

const request = (url: URL, options: SafeFetchOptions, signal: AbortSignal) =>
	new Promise<http.IncomingMessage>((resolve, reject) => {
		const lib = url.protocol === 'https:' ? https : http;
		const req = lib.request(url, {
			method: 'GET',
			agent: false,
			lookup: vettedLookup(options),
			signal,
			headers: {
				'user-agent': 'MealPlannerRecipeImport/1.0 (+recipe import for a private meal planner)',
				accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
				'accept-encoding': 'gzip, deflate, br',
				'accept-language': 'en'
			}
		});
		req.on('response', resolve);
		req.on('error', reject);
		req.end();
	});

const decompress = (res: http.IncomingMessage): Readable => {
	switch ((res.headers['content-encoding'] ?? '').toLowerCase()) {
		case 'gzip':
		case 'x-gzip':
			return res.pipe(zlib.createGunzip());
		case 'deflate':
			return res.pipe(zlib.createInflate());
		case 'br':
			return res.pipe(zlib.createBrotliDecompress());
		default:
			return res;
	}
};

const decode = (body: Buffer, contentType: string) => {
	const charset = contentType.match(/charset=["']?([\w-]+)/i)?.[1];
	try {
		return new TextDecoder(charset ?? 'utf-8').decode(body);
	} catch {
		return new TextDecoder('utf-8').decode(body);
	}
};

const readBody = async (res: http.IncomingMessage, maxBytes: number): Promise<Buffer> => {
	const stream = decompress(res);
	const chunks: Buffer[] = [];
	let size = 0;
	try {
		for await (const chunk of stream) {
			size += (chunk as Buffer).length;
			if (size > maxBytes) throw new FetchError('too-large');
			chunks.push(chunk as Buffer);
		}
	} finally {
		res.destroy();
	}
	return Buffer.concat(chunks);
};

/**
 * Fetches a recipe page for the server, reaching only public web servers. Redirects are
 * followed by hand and every hop is checked again. Stops after `timeoutMs` (10 s) for the
 * whole chain or `maxBytes` (2 MB) of decoded body, and accepts only HTML.
 */
export const safeFetch = async (
	raw: string,
	options: SafeFetchOptions = {}
): Promise<FetchedPage> => {
	const { timeoutMs = 10_000, maxBytes = 2 * 1024 * 1024, maxRedirects = 3 } = options;
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);

	try {
		let url = checkUrl(raw, options);
		for (let hop = 0; ; hop++) {
			const res = await request(url, options, controller.signal);
			const status = res.statusCode ?? 0;

			if (REDIRECTS.has(status)) {
				res.destroy();
				const location = res.headers.location;
				if (!location) throw new FetchError('unreachable');
				if (hop >= maxRedirects) throw new FetchError('redirects');
				url = checkUrl(new URL(location, url).href, options);
				continue;
			}
			if (status < 200 || status >= 300) {
				res.destroy();
				throw new FetchError('blocked');
			}

			const contentType = String(res.headers['content-type'] ?? '');
			if (!HTML_TYPES.some((type) => contentType.toLowerCase().startsWith(type))) {
				res.destroy();
				throw new FetchError('not-html');
			}
			if (Number(res.headers['content-length'] ?? 0) > maxBytes) {
				res.destroy();
				throw new FetchError('too-large');
			}

			return { url: url.href, html: decode(await readBody(res, maxBytes), contentType) };
		}
	} catch (error) {
		if (error instanceof FetchError) throw error;
		if (controller.signal.aborted) throw new FetchError('timeout');
		// A refusal raised inside the lookup arrives wrapped by the socket.
		const cause = (error as { cause?: unknown }).cause;
		if (cause instanceof FetchError) throw cause;
		throw new FetchError('unreachable');
	} finally {
		clearTimeout(timer);
	}
};
