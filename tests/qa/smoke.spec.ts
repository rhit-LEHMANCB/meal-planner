// Baseline QA for the deployed dev site: sign-in, recipe CRUD and privacy between users.
// Every later change's QA starts from this and adds its own specs under tests/qa/<change-name>/.
import { expect, test } from '@playwright/test';
import { credentials, deleteQaRecipes, open, QA_PREFIX, signIn, signOut } from './helpers';

test.describe.configure({ mode: 'serial' });

const creds = credentials();
const title = `${QA_PREFIX}smoke-${Date.now()}`;
let recipeUrl = '';

test.afterAll(async ({ browser }) => {
	// Leave nothing behind, even if a test failed half way.
	const context = await browser.newContext();
	const page = await context.newPage();
	await signIn(page, creds.user);
	await deleteQaRecipes(page);
	await context.close();
});

test('a signed-out visitor is sent to sign-in', async ({ page }) => {
	await open(page, '/recipes');
	await expect(page).toHaveURL(/\/signin$/);
	await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});

test('a wrong password shows the generic message', async ({ page }) => {
	await open(page, '/signin');
	await page.getByLabel('Email').fill(creds.user.email);
	await page.getByLabel('Password', { exact: true }).fill('definitely-not-the-password');
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page.getByText('Email or password is incorrect.')).toBeVisible();
	await expect(page).toHaveURL(/\/signin$/);
});

test('an account that is not on the allowlist cannot get a session', async ({ page }) => {
	await open(page, '/signup');
	await page.getByLabel('Email').fill('qa-stranger@example.com');
	await page.getByLabel('Password').fill('longenough123');
	await page.getByRole('button', { name: 'Create account' }).click();
	await expect(page.getByText('This app is invite-only.')).toBeVisible();
});

test('the QA user signs in and sees an empty or existing shelf', async ({ page }) => {
	await signIn(page, creds.user);
	await expect(page.getByRole('heading', { name: 'Recipes', exact: true })).toBeVisible();
	await expect(page.getByText(creds.user.email)).toBeVisible();
});

test('create, view and edit a recipe', async ({ page }) => {
	await signIn(page, creds.user);
	await open(page, '/recipes/new');
	await page.getByLabel('Title').fill(title);
	await page.getByLabel('Servings').fill('4');
	await page.getByLabel('Total time').fill('45');
	await page.getByLabel('Source link').fill('https://example.com/qa');
	// Pasted lines become ingredient rows; blank lines are dropped.
	await page.getByLabel('Paste ingredient lines').fill('first\n\n  second  \nthird');
	await page.getByLabel('Steps').fill('Do one.\nDo two.');
	await page.getByRole('button', { name: 'Save recipe' }).click();

	await expect(page.getByRole('heading', { name: title })).toBeVisible();
	await expect(page.getByText('4 servings')).toBeVisible();
	const ingredients = await page
		.getByRole('region', { name: 'Ingredients' })
		.locator('li')
		.allTextContents();
	expect(ingredients.map((s) => s.trim())).toEqual(['first', 'second', 'third']);
	recipeUrl = new URL(page.url()).pathname;

	await page.getByRole('link', { name: 'Edit' }).click();
	await page.getByLabel('Title').fill(`${title}-edited`);
	await page.getByLabel('Steps').fill('Only step.');
	await page.getByRole('button', { name: 'Save changes' }).click();
	await expect(page.getByRole('heading', { name: `${title}-edited` })).toBeVisible();
	await expect(page.getByText('Only step.')).toBeVisible();
	// Editing other fields leaves the ingredient rows as they were.
	const afterEdit = await page
		.getByRole('region', { name: 'Ingredients' })
		.locator('li')
		.allTextContents();
	expect(afterEdit.map((s) => s.trim())).toEqual(['first', 'second', 'third']);
});

test('the form rejects a bad source link without saving', async ({ page }) => {
	await signIn(page, creds.user);
	await open(page, '/recipes/new');
	await page.getByLabel('Title').fill(`${QA_PREFIX}bad-link`);
	await page.getByLabel('Servings').fill('2');
	await page.getByLabel('Source link').fill('example.com/no-scheme');
	await page.getByRole('button', { name: 'Save recipe' }).click();
	await expect(page.getByText('That link does not look right.')).toBeVisible();
	await open(page, `/recipes?q=${QA_PREFIX}bad-link`);
	await expect(page.getByText('No recipes match')).toBeVisible();
});

test('another user cannot see or open the recipe', async ({ page }) => {
	expect(recipeUrl, 'the create test must run first').toBeTruthy();
	await signIn(page, creds.other);

	await open(page, recipeUrl);
	await expect(page.getByText('We could not find that')).toBeVisible();

	await open(page, `/recipes?q=${QA_PREFIX}`);
	await expect(page.getByRole('link', { name: new RegExp(title) })).toHaveCount(0);
});

test('search finds the recipe, delete asks first, then removes it', async ({ page }) => {
	await signIn(page, creds.user);
	await open(page, `/recipes?q=${encodeURIComponent(title.toUpperCase())}`);
	await expect(page.getByRole('link', { name: new RegExp(title) })).toBeVisible();

	await open(page, recipeUrl);
	await page.getByRole('button', { name: 'Delete', exact: true }).click();
	await expect(page.getByText('Delete this recipe?')).toBeVisible();
	await page.getByRole('button', { name: 'Cancel' }).click();
	await expect(page.getByRole('heading', { name: `${title}-edited` })).toBeVisible();

	await page.getByRole('button', { name: 'Delete', exact: true }).click();
	await page.getByRole('button', { name: 'Delete recipe' }).click();
	await expect(page).toHaveURL(/\/recipes$/);
	await open(page, recipeUrl);
	await expect(page.getByText('We could not find that')).toBeVisible();
});

test('signing out ends the session', async ({ page }) => {
	await signIn(page, creds.user);
	await signOut(page);
	await open(page, '/recipes');
	await expect(page).toHaveURL(/\/signin$/);
});
