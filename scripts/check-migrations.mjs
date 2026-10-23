// Fails when a migration could break the running app during a rollout.
//
// Migrations run on merge, and App Hosting rolls out the new code a few minutes later, so for a
// short time old code runs on the new schema. Migrations must therefore be additive. A file that
// really needs a destructive step (after the code stopped using it) opts out with a first line of
//   -- allow-destructive: <reason>
//
// Run with `npm run check:migrations`.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(fileURLToPath(new URL('..', import.meta.url)), 'drizzle');

const RULES = [
	[/\bDROP\s+(TABLE|COLUMN|SCHEMA)\b/i, 'drops a table, column or schema'],
	[/\bTRUNCATE\b/i, 'truncates a table'],
	[/\bDELETE\s+FROM\b/i, 'deletes rows'],
	[/\bRENAME\b/i, 'renames something old code still uses'],
	[/\bALTER\s+COLUMN\b[^;]*\bTYPE\b/i, 'changes a column type'],
	[/\bSET\s+NOT\s+NULL\b/i, 'makes an existing column NOT NULL'],
	[
		/\bADD\s+COLUMN\b(?![^;]*\bDEFAULT\b)[^;]*\bNOT\s+NULL\b/i,
		'adds a NOT NULL column without a DEFAULT (old code cannot insert)'
	]
];

const problems = [];
for (const file of readdirSync(dir)
	.filter((f) => f.endsWith('.sql'))
	.sort()) {
	const sql = readFileSync(join(dir, file), 'utf8');
	if (/^\s*--\s*allow-destructive\b/i.test(sql)) continue;
	for (const statement of sql.split('--> statement-breakpoint')) {
		for (const [pattern, why] of RULES) {
			if (pattern.test(statement)) {
				problems.push(`${file}: ${why}\n    ${statement.trim().split('\n')[0]}`);
			}
		}
	}
}

if (problems.length) {
	console.error('Migrations that are not safe to run before the new code is live:\n');
	console.error(problems.map((p) => `  ${p}`).join('\n'));
	console.error(
		'\nMake the migration additive and remove the old thing in a later change, or add\n"-- allow-destructive: <reason>" as the first line of the file.'
	);
	process.exit(1);
}
console.log('Migrations OK: all additive.');
