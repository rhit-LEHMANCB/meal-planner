// Creates (or resets) the two QA accounts used by the dev-lifecycle QA stage and writes their
// credentials to the gitignored .env.qa. Accounts are created already verified, so no email is sent.
// The same Firebase project serves every environment, so keep these addresses out of the
// production ALLOWED_EMAILS: they can only sign in to the dev backend.
//
// Usage: node scripts/create-qa-users.mjs you@example.com
//   -> you+meal-qa-user@example.com and you+meal-qa-other@example.com
// Reads the Firebase Admin credentials from .env.
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const base = process.argv[2];
if (!base || !/^[^@\s+]+@[^@\s]+$/.test(base)) {
	console.error('Usage: node scripts/create-qa-users.mjs you@example.com');
	process.exit(1);
}
const [local, domain] = base.split('@');

process.loadEnvFile('.env');
const { privateKey } = JSON.parse(process.env.FB_PRIVATE_KEY);
initializeApp({
	credential: cert({
		projectId: process.env.PUBLIC_FB_PROJECT_ID,
		clientEmail: process.env.FB_CLIENT_EMAIL,
		privateKey
	})
});
const auth = getAuth();

const accounts = {
	QA_USER: `${local}+meal-qa-user@${domain}`,
	QA_OTHER_USER: `${local}+meal-qa-other@${domain}`
};

const env = {};
for (const [prefix, email] of Object.entries(accounts)) {
	const password = randomBytes(18).toString('base64url');
	try {
		const existing = await auth.getUserByEmail(email);
		await auth.updateUser(existing.uid, { password, emailVerified: true });
		console.log(`reset   ${email}`);
	} catch (err) {
		if (err.code !== 'auth/user-not-found') throw err;
		await auth.createUser({ email, password, emailVerified: true });
		console.log(`created ${email}`);
	}
	env[`${prefix}_EMAIL`] = email;
	env[`${prefix}_PASSWORD`] = password;
}

// Keep anything else already in .env.qa (like QA_BASE_URL).
let kept = '';
try {
	kept = readFileSync('.env.qa', 'utf8')
		.split('\n')
		.filter((line) => line.trim() && !/^QA_(OTHER_)?USER_(EMAIL|PASSWORD)=/.test(line))
		.join('\n');
} catch {
	// No existing file.
}
const lines = Object.entries(env).map(([k, v]) => `${k}="${v}"`);
writeFileSync('.env.qa', [kept, ...lines].filter(Boolean).join('\n') + '\n', { mode: 0o600 });
console.log('wrote .env.qa (gitignored)');
console.log(`allowlist addition for the dev backend: ${Object.values(accounts).join(',')}`);
