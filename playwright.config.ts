import { defineConfig } from '@playwright/test';

// QA credentials and the target URL live in the gitignored .env.qa (see scripts/create-qa-users.mjs).
try {
	process.loadEnvFile('.env.qa');
} catch {
	// No .env.qa: rely on the real environment.
}

// QA runs against the deployed dev backend, never production.
const DEV_URL = 'https://meal-planner-dev--lehman-meals.us-east5.hosted.app';

export default defineConfig({
	projects: [
		{
			name: 'qa',
			testDir: 'tests/qa',
			testMatch: '**/*.spec.ts',
			use: {
				baseURL: process.env.QA_BASE_URL ?? DEV_URL,
				trace: 'retain-on-failure',
				screenshot: 'only-on-failure'
			}
		}
	],
	// The dev site cold-starts from zero instances, so allow generous timeouts.
	timeout: 60_000,
	expect: { timeout: 15_000 },
	reporter: [['list']],
	outputDir: 'test-results'
});
