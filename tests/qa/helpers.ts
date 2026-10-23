import { expect, type Page } from '@playwright/test';

/** QA accounts from .env.qa. Throws with the missing names (never the values). */
export const credentials = () => {
	const names = [
		'QA_USER_EMAIL',
		'QA_USER_PASSWORD',
		'QA_OTHER_USER_EMAIL',
		'QA_OTHER_USER_PASSWORD'
	] as const;
	const missing = names.filter((n) => !process.env[n]);
	if (missing.length) {
		throw new Error(
			`Missing QA credentials: ${missing.join(', ')}. See scripts/create-qa-users.mjs.`
		);
	}
	return {
		user: { email: process.env.QA_USER_EMAIL!, password: process.env.QA_USER_PASSWORD! },
		other: {
			email: process.env.QA_OTHER_USER_EMAIL!,
			password: process.env.QA_OTHER_USER_PASSWORD!
		}
	};
};

/** Opens a page and waits until it is interactive, so typing is not overwritten by hydration. */
export const open = async (page: Page, path: string) => {
	await page.goto(path);
	await page.locator('html[data-hydrated="true"]').waitFor();
};

export const signIn = async (page: Page, account: { email: string; password: string }) => {
	await open(page, '/signin');
	await page.getByLabel('Email').fill(account.email);
	await page.getByLabel('Password', { exact: true }).fill(account.password);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await page.waitForURL('**/recipes');
};

export const signOut = async (page: Page) => {
	await page.getByRole('button', { name: 'Sign out' }).click();
	await page.waitForURL('**/signin');
};

/** Recipes created by QA are named with this prefix, so cleanup never touches anything else. */
export const QA_PREFIX = 'qa-';

/** Deletes every recipe whose title starts with the QA prefix, through the UI. */
export const deleteQaRecipes = async (page: Page) => {
	for (let guard = 0; guard < 20; guard++) {
		await open(page, `/recipes?q=${QA_PREFIX}`);
		const link = page.getByRole('link', { name: new RegExp(`^${QA_PREFIX}`) }).first();
		if (!(await link.isVisible().catch(() => false))) return;
		await link.click();
		await page.getByRole('button', { name: 'Delete', exact: true }).click();
		await page.getByRole('button', { name: 'Delete recipe' }).click();
		await expect(page).toHaveURL(/\/recipes$/);
	}
};
