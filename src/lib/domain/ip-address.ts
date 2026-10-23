/** Parses dotted IPv4 ("10.0.0.1") into a 32-bit number, or null. Only the strict 4-part form. */
const parseIPv4 = (text: string): number | null => {
	const parts = text.split('.');
	if (parts.length !== 4) return null;
	let value = 0;
	for (const part of parts) {
		if (!/^\d{1,3}$/.test(part)) return null;
		const n = Number(part);
		if (n > 255) return null;
		value = value * 256 + n;
	}
	return value;
};

/** Parses IPv6 into 8 16-bit groups, or null. Accepts "::" and a trailing dotted IPv4. */
const parseIPv6 = (input: string): number[] | null => {
	let text = input.toLowerCase();
	const zone = text.indexOf('%');
	if (zone !== -1) text = text.slice(0, zone);
	if (!text.includes(':')) return null;

	// A trailing IPv4 ("::ffff:1.2.3.4") becomes two groups.
	const lastColon = text.lastIndexOf(':');
	const tail = text.slice(lastColon + 1);
	if (tail.includes('.')) {
		const v4 = parseIPv4(tail);
		if (v4 === null) return null;
		text = `${text.slice(0, lastColon + 1)}${(v4 >>> 16).toString(16)}:${(v4 & 0xffff).toString(16)}`;
	}

	const halves = text.split('::');
	if (halves.length > 2) return null;
	const toGroups = (s: string) => (s === '' ? [] : s.split(':'));
	const head = toGroups(halves[0]);
	const rest = halves.length === 2 ? toGroups(halves[1]) : [];
	const missing = 8 - head.length - rest.length;
	if (halves.length === 1 ? missing !== 0 : missing < 1) return null;

	const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...rest];
	const out: number[] = [];
	for (const g of groups) {
		if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
		out.push(parseInt(g, 16));
	}
	return out;
};

const v4 = (a: number, b: number, c: number, d: number) => ((a * 256 + b) * 256 + c) * 256 + d;

/** IPv4 ranges that are not the public internet: [network, prefix length]. */
const BLOCKED_V4: [number, number][] = [
	[v4(0, 0, 0, 0), 8], // "this network"
	[v4(10, 0, 0, 0), 8], // private
	[v4(100, 64, 0, 0), 10], // carrier-grade NAT
	[v4(127, 0, 0, 0), 8], // loopback
	[v4(169, 254, 0, 0), 16], // link-local, including cloud metadata (169.254.169.254)
	[v4(172, 16, 0, 0), 12], // private
	[v4(192, 0, 0, 0), 24], // IETF protocol assignments
	[v4(192, 0, 2, 0), 24], // documentation
	[v4(192, 88, 99, 0), 24], // 6to4 relay anycast
	[v4(192, 168, 0, 0), 16], // private
	[v4(198, 18, 0, 0), 15], // benchmarking
	[v4(198, 51, 100, 0), 24], // documentation
	[v4(203, 0, 113, 0), 24], // documentation
	[v4(224, 0, 0, 0), 4], // multicast
	[v4(240, 0, 0, 0), 4] // reserved, including broadcast
];

const inV4Range = (ip: number, [net, bits]: [number, number]) => {
	const size = 2 ** (32 - bits);
	return ip >= net && ip < net + size;
};

const isPublicV4 = (ip: number) => !BLOCKED_V4.some((range) => inV4Range(ip, range));

const isPublicV6 = (g: number[]): boolean => {
	const allZeroUntil = (n: number) => g.slice(0, n).every((x) => x === 0);

	// :: (unspecified) and ::1 (loopback)
	if (allZeroUntil(7) && (g[7] === 0 || g[7] === 1)) return false;
	// IPv4-mapped ::ffff:a.b.c.d and IPv4-compatible ::a.b.c.d: judge the embedded IPv4.
	if (allZeroUntil(5) && (g[5] === 0xffff || g[5] === 0)) return isPublicV4(g[6] * 65536 + g[7]);
	// NAT64 64:ff9b::/96 can reach any IPv4, so judge the embedded address too.
	if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) {
		return isPublicV4(g[6] * 65536 + g[7]);
	}
	if (g[0] === 0x64 && g[1] === 0xff9b && g[2] === 1) return false; // 64:ff9b:1::/48 local NAT64
	if ((g[0] & 0xfe00) === 0xfc00) return false; // fc00::/7 unique local
	if ((g[0] & 0xffc0) === 0xfe80) return false; // fe80::/10 link-local
	if ((g[0] & 0xffc0) === 0xfec0) return false; // fec0::/10 old site-local
	if ((g[0] & 0xff00) === 0xff00) return false; // ff00::/8 multicast
	if (g[0] === 0x2001 && g[1] === 0x0db8) return false; // documentation
	if (g[0] === 0x2001 && g[1] < 0x0200) return false; // 2001::/23 IETF special purpose (Teredo, ORCHID ...)
	if (g[0] === 0x2002) return isPublicV4(g[1] * 65536 + g[2]); // 6to4 embeds an IPv4
	if (g[0] === 0x0100 && g[1] === 0 && g[2] === 0 && g[3] === 0) return false; // 100::/64 discard
	return true;
};

/**
 * True only for an address on the public internet. Anything else (private, loopback,
 * link-local, metadata, multicast, reserved, or not an IP at all) is refused, so a recipe
 * link can never make the server reach its own network.
 */
export const isPublicAddress = (address: string): boolean => {
	const text = address.startsWith('[') && address.endsWith(']') ? address.slice(1, -1) : address;
	const ipv4 = parseIPv4(text);
	if (ipv4 !== null) return isPublicV4(ipv4);
	const ipv6 = parseIPv6(text);
	if (ipv6 !== null) return isPublicV6(ipv6);
	return false;
};

/** True when the text is an IP address literal (with or without IPv6 brackets). */
export const isIpLiteral = (host: string): boolean => {
	const text = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
	return parseIPv4(text) !== null || parseIPv6(text) !== null;
};
