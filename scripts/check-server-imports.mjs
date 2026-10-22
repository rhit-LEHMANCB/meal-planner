// Fails when the server build imports a package that the deployed Cloud Function would not install.
//
// Firebase Hosting builds the function from `dependencies` (devDependencies are dropped) plus
// @sveltejs/kit, and Vite leaves some imports of bundled packages external (for example the
// dependencies of sveltekit-superforms). A package missing from that install makes the page that
// needs it return HTTP 500 on the deployed site while every local test passes.
//
// Run after `npm run build`.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const serverDir = join(root, '.svelte-kit/output/server');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8')).packages;

const installed = new Set();
const queue = [...Object.keys(pkg.dependencies ?? {}), '@sveltejs/kit'];
while (queue.length) {
	const name = queue.pop();
	if (installed.has(name)) continue;
	const entry = lock[`node_modules/${name}`];
	if (!entry) continue;
	installed.add(name);
	for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
		queue.push(...Object.keys(entry[field] ?? {}));
	}
}

const walk = (dir) =>
	readdirSync(dir).flatMap((file) => {
		const path = join(dir, file);
		return statSync(path).isDirectory() ? walk(path) : path.endsWith('.js') ? [path] : [];
	});

const builtins = new Set(builtinModules);
const missing = new Map();
for (const file of walk(serverDir)) {
	const source = readFileSync(file, 'utf8');
	for (const match of source.matchAll(/(?:\bfrom|\bimport)\s*\(?\s*["']([^"'./#$][^"']*)["']/g)) {
		const spec = match[1];
		const name = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
		// Only real packages count: the pattern can also match words inside comments or strings.
		if (builtins.has(name) || !lock[`node_modules/${name}`] || installed.has(name)) continue;
		missing.set(name, file.replace(serverDir, 'server'));
	}
}

if (missing.size) {
	console.error('The server build imports packages the deployed function would not install:');
	for (const [name, file] of missing) console.error(`  ${name} (first seen in ${file})`);
	console.error('Move each one to "dependencies" in package.json.');
	process.exit(1);
}
console.log(
	`Server imports OK: every external package is installed with the function (${installed.size} packages).`
);
