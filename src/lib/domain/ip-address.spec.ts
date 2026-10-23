import { describe, expect, it } from 'vitest';
import { isIpLiteral, isPublicAddress } from './ip-address';

describe('isPublicAddress', () => {
	it.each([
		'0.0.0.0',
		'10.0.0.5',
		'100.64.1.1',
		'127.0.0.1',
		'127.1.2.3',
		'169.254.169.254',
		'172.16.0.1',
		'172.31.255.255',
		'192.0.0.8',
		'192.0.2.10',
		'192.168.1.1',
		'198.18.0.1',
		'198.51.100.7',
		'203.0.113.9',
		'224.0.0.1',
		'240.0.0.1',
		'255.255.255.255'
	])('refuses IPv4 %s', (ip) => {
		expect(isPublicAddress(ip)).toBe(false);
	});

	it.each([
		'::',
		'::1',
		'[::1]',
		'0:0:0:0:0:0:0:1',
		'fc00::1',
		'fd12:3456::1',
		'fe80::1',
		'fe80::1%eth0',
		'fec0::1',
		'ff02::1',
		'2001:db8::1',
		'2001::1',
		'::ffff:127.0.0.1',
		'::ffff:7f00:1',
		'::ffff:169.254.169.254',
		'::127.0.0.1',
		'64:ff9b::10.0.0.1',
		'2002:c0a8:0101::1',
		'100::1'
	])('refuses IPv6 %s', (ip) => {
		expect(isPublicAddress(ip)).toBe(false);
	});

	it.each([
		'8.8.8.8',
		'1.1.1.1',
		'172.32.0.1',
		'93.184.216.34',
		'2606:4700::1111',
		'::ffff:8.8.8.8'
	])('allows public %s', (ip) => {
		expect(isPublicAddress(ip)).toBe(true);
	});

	it.each(['localhost', 'example.com', '', '1.2.3', '1.2.3.4.5', '256.1.1.1', '1::2::3', 'gg::1'])(
		'refuses %j, which is not an IP address',
		(text) => {
			expect(isPublicAddress(text)).toBe(false);
		}
	);
});

describe('isIpLiteral', () => {
	it('recognises IPv4 and IPv6 literals and nothing else', () => {
		expect(isIpLiteral('10.0.0.1')).toBe(true);
		expect(isIpLiteral('[::1]')).toBe(true);
		expect(isIpLiteral('2606:4700::1111')).toBe(true);
		expect(isIpLiteral('example.com')).toBe(false);
		expect(isIpLiteral('0x7f.1')).toBe(false);
	});
});
