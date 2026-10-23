import http from 'node:http';
import type { AddressInfo } from 'node:net';
import zlib from 'node:zlib';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { checkUrl, FetchError, safeFetch, type SafeFetchOptions } from './safe-fetch';

// A local server stands in for the internet. "recipes.test" resolves to it and is treated as
// public; "internal.test" resolves to a private address.
let server: http.Server;
let port = 0;
let hits: string[] = [];

const routes: Record<string, (res: http.ServerResponse) => void> = {
	'/recipe': (res) => {
		res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
		res.end('<html><h1>Chili</h1></html>');
	},
	'/gzip': (res) => {
		res.writeHead(200, { 'content-type': 'text/html', 'content-encoding': 'gzip' });
		res.end(zlib.gzipSync('<html>zipped</html>'));
	},
	'/pdf': (res) => {
		res.writeHead(200, { 'content-type': 'application/pdf' });
		res.end('%PDF');
	},
	'/big': (res) => {
		res.writeHead(200, { 'content-type': 'text/html' });
		res.end('x'.repeat(5000));
	},
	'/forbidden': (res) => {
		res.writeHead(403, { 'content-type': 'text/html' });
		res.end('no');
	},
	'/slow': () => {
		// Never answers.
	},
	'/to-recipe': (res) => {
		res.writeHead(302, { location: '/recipe' });
		res.end();
	},
	'/to-internal': (res) => {
		res.writeHead(302, { location: `http://internal.test:${port}/recipe` });
		res.end();
	},
	'/to-literal': (res) => {
		res.writeHead(301, { location: 'http://10.0.0.1/' });
		res.end();
	},
	'/stall-gzip': (res) => {
		// A valid gzip start, then nothing more: the decompressor waits for the rest.
		res.writeHead(200, { 'content-type': 'text/html', 'content-encoding': 'gzip' });
		res.write(zlib.gzipSync('<html>' + 'x'.repeat(10_000)).subarray(0, 20));
	},
	'/to-ftp': (res) => {
		res.writeHead(302, { location: 'ftp://example.com/recipe' });
		res.end();
	},
	'/loop': (res) => {
		res.writeHead(302, { location: '/loop' });
		res.end();
	}
};

const options = (over: SafeFetchOptions = {}): SafeFetchOptions => ({
	anyPort: true,
	isAllowedAddress: (ip) => ip === '127.0.0.1',
	resolve: async (host) => {
		if (host === 'recipes.test') return [{ address: '127.0.0.1', family: 4 }];
		if (host === 'internal.test') return [{ address: '10.0.0.1', family: 4 }];
		if (host === 'mixed.test')
			return [
				{ address: '127.0.0.1', family: 4 },
				{ address: '192.168.0.1', family: 4 }
			];
		throw new Error('ENOTFOUND');
	},
	...over
});

const reason = async (promise: Promise<unknown>) => {
	try {
		await promise;
		return 'ok';
	} catch (error) {
		return error instanceof FetchError ? error.reason : `other: ${String(error)}`;
	}
};

beforeAll(async () => {
	server = http.createServer((req, res) => {
		hits.push(req.url ?? '');
		(routes[req.url ?? ''] ?? ((r) => r.writeHead(404).end()))(res);
	});
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	port = (server.address() as AddressInfo).port;
});

afterAll(() => {
	server.closeAllConnections();
	server.close();
});

beforeEach(() => {
	hits = [];
});

const at = (path: string, host = 'recipes.test') => `http://${host}:${port}${path}`;

describe('checkUrl', () => {
	it.each([
		'file:///etc/passwd',
		'ftp://example.com/',
		'javascript:alert(1)',
		'http://user:pass@example.com/',
		'http://example.com:8080/',
		'not a link',
		''
	])('refuses %j before any request', (url) => {
		expect(() => checkUrl(url)).toThrowError(expect.objectContaining({ reason: 'invalid' }));
	});

	it.each([
		'http://169.254.169.254/latest/meta-data/',
		'http://127.0.0.1/',
		'http://10.0.0.5/',
		'http://[::1]/',
		'http://[::ffff:127.0.0.1]/',
		'http://2130706433/',
		'http://0x7f000001/'
	])('refuses the internal address %j', (url) => {
		expect(() => checkUrl(url)).toThrowError(expect.objectContaining({ reason: 'refused' }));
	});

	it('accepts a public https link on the default port', () => {
		expect(checkUrl('https://www.example.com/chili').hostname).toBe('www.example.com');
		expect(checkUrl('http://example.com:443/').hostname).toBe('example.com');
	});
});

describe('safeFetch', () => {
	it('reads a public page', async () => {
		const page = await safeFetch(at('/recipe'), options());
		expect(page.html).toContain('Chili');
	});

	it('decompresses gzip', async () => {
		expect((await safeFetch(at('/gzip'), options())).html).toContain('zipped');
	});

	it('follows a redirect and reports the final address', async () => {
		const page = await safeFetch(at('/to-recipe'), options());
		expect(page.url).toBe(at('/recipe'));
	});

	it('never connects to a literal internal address', async () => {
		expect(await reason(safeFetch(`http://127.0.0.1:${port}/recipe`, { anyPort: true }))).toBe(
			'refused'
		);
		expect(hits).toEqual([]);
	});

	it('refuses a host name that resolves to a private address', async () => {
		expect(await reason(safeFetch(at('/recipe', 'internal.test'), options()))).toBe('refused');
		expect(hits).toEqual([]);
	});

	it('refuses a host when any of its addresses is private', async () => {
		expect(await reason(safeFetch(at('/recipe', 'mixed.test'), options()))).toBe('refused');
		expect(hits).toEqual([]);
	});

	it('refuses a redirect to an internal host or address without requesting it', async () => {
		expect(await reason(safeFetch(at('/to-internal'), options()))).toBe('refused');
		expect(await reason(safeFetch(at('/to-literal'), options()))).toBe('refused');
		expect(hits).toEqual(['/to-internal', '/to-literal']);
	});

	it('stops after 3 redirects', async () => {
		expect(await reason(safeFetch(at('/loop'), options()))).toBe('redirects');
		expect(hits).toHaveLength(4);
	});

	it('refuses pages that are not HTML, too large, or refused by the site', async () => {
		expect(await reason(safeFetch(at('/pdf'), options()))).toBe('not-html');
		expect(await reason(safeFetch(at('/big'), options({ maxBytes: 1000 })))).toBe('too-large');
		expect(await reason(safeFetch(at('/forbidden'), options()))).toBe('blocked');
	});

	it('gives up after the time limit', async () => {
		expect(await reason(safeFetch(at('/slow'), options({ timeoutMs: 300 })))).toBe('timeout');
	});

	it('gives up after the time limit when a compressed body stalls', async () => {
		expect(await reason(safeFetch(at('/stall-gzip'), options({ timeoutMs: 300 })))).toBe('timeout');
	});

	it('reports a redirect to another scheme as unreachable, not as a bad link', async () => {
		expect(await reason(safeFetch(at('/to-ftp'), options()))).toBe('unreachable');
	});

	it('reports a host that does not resolve as unreachable', async () => {
		expect(await reason(safeFetch(at('/recipe', 'nowhere.test'), options()))).toBe('unreachable');
	});
});
