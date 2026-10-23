// QA for the modified `recipes` capability (structured ingredient rows). No AI is used here.
import { expect, test, type Page } from '@playwright/test';
import { credentials, deleteQaRecipes, open, QA_PREFIX, signIn } from '../helpers';
import { fillRow, readRows, shot } from './support';

test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

const creds = credentials();
const CAP = 'recipes';
const stamp = Date.now();
const t = (s: string) => `${QA_PREFIX}${s}-${stamp}`;
let page: Page;

test.beforeAll(async ({ browser }) => {
	page = await (await browser.newContext()).newPage();
	await signIn(page, creds.user);
});

test.afterAll(async () => {
	await deleteQaRecipes(page);
	await page.context().close();
});

const newForm = async () => {
	await open(page, '/recipes/new');
	// Let the server's messages show instead of the browser's own required-field popups.
	await page.evaluate(() =>
		document.querySelectorAll('form').forEach((f) => f.setAttribute('novalidate', ''))
	);
};
const openEdit = async () => {
	await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
	const href = await page.getByRole('link', { name: 'Edit', exact: true }).getAttribute('href');
	await open(page, href!);
	await expect(page.getByRole('heading', { name: 'Edit recipe' })).toBeVisible();
	await page.locator('html[data-hydrated="true"]').waitFor();
};
const save = () => page.getByRole('button', { name: 'Save recipe' }).click();
const detailIngredients = async () =>
	(await page.getByRole('region', { name: 'Ingredients' }).locator('li').allTextContents()).map(
		(s) => s.trim()
	);

test('Create a complete recipe', async () => {
	await newForm();
	await page.getByLabel('Title').fill(t('complete'));
	await page.getByLabel('Servings').fill('6');
	await fillRow(page, 1, { amount: '2', unit: 'cup', name: 'flour' });
	await fillRow(page, 2, { amount: '1', unit: 'tbsp', name: 'sugar', note: 'packed' });
	await fillRow(page, 3, { amount: '3', name: 'eggs' });
	await page.getByLabel('Steps').fill('Mix it.\nBake it.');
	await save();
	await expect(page.getByRole('heading', { name: t('complete') })).toBeVisible();
	const items = await detailIngredients();
	expect(items.length).toBe(3);
	expect(items[0]).toMatch(/flour/);
	expect(items[1]).toMatch(/sugar/);
	expect(items[2]).toMatch(/eggs/);
	await expect(page.getByRole('region', { name: 'Steps' }).locator('li')).toHaveText([
		'Mix it.',
		'Bake it.'
	]);
	await shot(page, `${CAP}-create-a-complete-recipe`);
});

test('Missing title', async () => {
	await newForm();
	await page.getByLabel('Servings').fill('2');
	await fillRow(page, 1, { name: 'x' });
	await save();
	await expect(page.getByText('Title is required.')).toBeVisible();
	await shot(page, `${CAP}-missing-title`);
	await open(page, `/recipes?q=${QA_PREFIX}`);
});

test('Invalid servings', async () => {
	for (const [i, v] of ['0', '-3', '1.5', 'many'].entries()) {
		await newForm();
		await page.getByLabel('Title').fill(t('badservings'));
		await page.getByLabel('Servings').fill(v);
		await save();
		await expect(page.getByText(/Servings must be a whole number/)).toBeVisible();
		if (i === 0) await shot(page, `${CAP}-invalid-servings`);
	}
	await open(page, `/recipes?q=badservings-${stamp}`);
	await expect(page.getByRole('link', { name: t('badservings') })).toHaveCount(0);
});

test('Invalid source link', async () => {
	await newForm();
	await page.getByLabel('Title').fill(t('badlink'));
	await page.getByLabel('Servings').fill('2');
	await page.getByLabel('Source link (optional)').fill('ftp://example.com/x');
	await save();
	await expect(page.getByText('That link does not look right.')).toBeVisible();
	await shot(page, `${CAP}-invalid-source-link`);
});

test('Invalid amount', async () => {
	for (const [i, v] of ['a handful', '-2'].entries()) {
		await newForm();
		await page.getByLabel('Title').fill(t('badamount'));
		await page.getByLabel('Servings').fill('2');
		await fillRow(page, 1, { amount: v, unit: 'cup', name: 'flour' });
		await save();
		const err = page
			.locator('li[data-row="1"]')
			.getByText('Use a number or a fraction such as 1/2.');
		await expect(err).toBeVisible();
		if (i === 0) await shot(page, `${CAP}-invalid-amount`);
	}
	await open(page, `/recipes?q=badamount-${stamp}`);
	await expect(page.getByRole('link', { name: t('badamount') })).toHaveCount(0);
});

test('Row without a name', async () => {
	await newForm();
	await page.getByLabel('Title').fill(t('noname'));
	await page.getByLabel('Servings').fill('2');
	await fillRow(page, 1, { amount: '2', unit: 'cup', name: '' });
	await save();
	await expect(
		page.locator('li[data-row="1"]').getByText('Add a name for this ingredient.')
	).toBeVisible();
	await shot(page, `${CAP}-row-without-a-name`);
});

test('Order, blank lines and no ingredients', async () => {
	await newForm();
	await page.getByLabel('Title').fill(t('order'));
	await page.getByLabel('Servings').fill('2');
	await fillRow(page, 1, { name: 'flour' });
	await fillRow(page, 2, { name: 'eggs' });
	await fillRow(page, 3, { amount: '', unit: '', name: '', note: '' }); // an all-empty row
	await fillRow(page, 4, { name: 'milk' });
	await page.getByLabel('Steps').fill('One\n\n   \nTwo\n');
	await save();
	await expect(page.getByRole('heading', { name: t('order') })).toBeVisible();
	const items = await detailIngredients();
	expect(items.length).toBe(3);
	expect(items.map((s) => s.match(/flour|eggs|milk/)?.[0])).toEqual(['flour', 'eggs', 'milk']);
	await expect(page.getByRole('region', { name: 'Steps' }).locator('li')).toHaveText([
		'One',
		'Two'
	]);
	await shot(page, `${CAP}-order-is-preserved`);
	await shot(page, `${CAP}-blank-lines-dropped`);

	await newForm();
	await page.getByLabel('Title').fill(t('noingredients'));
	await page.getByLabel('Servings').fill('2');
	await save();
	await expect(page.getByRole('heading', { name: t('noingredients') })).toBeVisible();
	await expect(page.getByText('No ingredients yet.')).toBeVisible();
	await shot(page, `${CAP}-recipe-with-no-ingredients`);
});

test('Edit title and steps; edit fails validation; reorder', async () => {
	await open(page, `/recipes?q=${t('complete')}`);
	await page.getByRole('link', { name: t('complete') }).click();
	await openEdit();
	await page.getByLabel('Title').fill(t('complete-edited'));
	await page.getByLabel('Steps').fill('Only bake it.');
	await page.getByRole('button', { name: 'Save changes' }).click();
	await expect(page.getByRole('heading', { name: t('complete-edited') })).toBeVisible();
	await expect(page.getByRole('region', { name: 'Steps' }).locator('li')).toHaveText([
		'Only bake it.'
	]);
	await shot(page, `${CAP}-edit-title-and-steps`);

	await openEdit();
	await page.evaluate(() =>
		document.querySelectorAll('form').forEach((f) => f.setAttribute('novalidate', ''))
	);
	await page.getByLabel('Title').fill('');
	await page.getByRole('button', { name: 'Save changes' }).click();
	await expect(page.getByText('Title is required.')).toBeVisible();
	await shot(page, `${CAP}-edit-fails-validation`);
	await open(page, `/recipes?q=${t('complete-edited')}`);
	await expect(page.getByRole('link', { name: t('complete-edited') })).toBeVisible();

	// Reorder: move the third row to the top.
	await page.getByRole('link', { name: t('complete-edited') }).click();
	await openEdit();
	await page.getByRole('button', { name: 'Move row 3 up' }).click();
	await page.getByRole('button', { name: 'Move row 2 up' }).click();
	await page.getByRole('button', { name: 'Save changes' }).click();
	await expect(page.getByRole('heading', { name: t('complete-edited') })).toBeVisible();
	const items = await detailIngredients();
	expect(items[0]).toMatch(/eggs/);
	expect(items[1]).toMatch(/flour/);
	expect(items[2]).toMatch(/sugar/);
	await shot(page, `${CAP}-reorder-ingredients`);
});

test('Editing keeps ingredient details; chip follows edits; reorder keeps details', async () => {
	await newForm();
	await page.getByLabel('Title').fill(t('details'));
	await page.getByLabel('Servings').fill('4');
	await fillRow(page, 1, { amount: '2', unit: 'tbsp', name: 'chili powder', note: 'divided' });
	await fillRow(page, 2, { amount: '1', unit: 'cup', name: 'rice', note: '' });
	await fillRow(page, 3, { amount: '3', unit: '', name: 'eggs', note: 'large' });
	await save();
	await expect(page.getByRole('heading', { name: t('details') })).toBeVisible();
	const original = [
		{ amount: '2', unit: 'tbsp', name: 'chili powder', note: 'divided', status: 'Parsed' },
		{ amount: '1', unit: 'cup', name: 'rice', note: '', status: 'Parsed' },
		{ amount: '3', unit: '', name: 'eggs', note: 'large', status: 'Parsed' }
	];
	const edit = openEdit;
	const saveEdit = () => page.getByRole('button', { name: 'Save changes' }).click();

	// Edit the title of a recipe with amounts, units and notes.
	await edit();
	expect(await readRows(page)).toEqual(original);
	await page.getByLabel('Title').fill(t('details-2'));
	await saveEdit();
	await expect(page.getByRole('heading', { name: t('details-2') })).toBeVisible();
	await edit();
	expect(await readRows(page)).toEqual(original);
	await shot(page, `${CAP}-edit-the-title-of-an-imported-recipe`);

	// Change one row.
	await fillRow(page, 2, { amount: '2' });
	await saveEdit();
	await expect(page.getByRole('heading', { name: t('details-2') })).toBeVisible();
	const items = await detailIngredients();
	expect(items[1]).toMatch(/^2\b.*rice/);
	await shot(page, `${CAP}-change-one-row`);
	await edit();
	const rows = await readRows(page);
	expect(rows[0]).toEqual(original[0]);
	expect(rows[1]).toMatchObject({ amount: '2', unit: 'cup', name: 'rice' });
	expect(rows[2]).toEqual(original[2]);

	// Chip follows edits: cup -> scoop.
	await expect(page.locator('li[data-row="2"] [data-status]')).toHaveText('Parsed');
	await fillRow(page, 2, { unit: 'scoop' });
	await expect(page.locator('li[data-row="2"] [data-status]')).toHaveText('Check');
	await saveEdit();
	await expect(page.getByRole('heading', { name: t('details-2') })).toBeVisible();
	await edit();
	await expect(page.locator('li[data-row="2"] [data-status]')).toHaveText('Check');
	await shot(page, `${CAP}-chip-follows-edits`);

	// Reorder keeps details: move row 1 (chili powder) to position 3.
	await page.getByRole('button', { name: 'Move row 1 down' }).click();
	await page.getByRole('button', { name: 'Move row 2 down' }).click();
	await saveEdit();
	await expect(page.getByRole('heading', { name: t('details-2') })).toBeVisible();
	await edit();
	const moved = await readRows(page);
	expect(moved[2]).toEqual(original[0]);
	expect(moved.map((r) => r.name)).toEqual(['rice', 'eggs', 'chili powder']);
	expect(moved[1]).toEqual(original[2]);
	await shot(page, `${CAP}-reorder-keeps-details`);
});

test('Paste lines', async () => {
	await open(page, '/recipes/new');
	await page
		.getByLabel('Paste ingredient lines')
		.fill('1 lb ground turkey\n2 tbsp chili powder\nSalt to taste');
	await page.getByRole('button', { name: 'Add lines' }).click();
	const rows = await readRows(page);
	expect(rows).toHaveLength(3);
	expect(rows[0]).toMatchObject({
		amount: '1',
		unit: 'lb',
		name: 'ground turkey',
		status: 'Parsed'
	});
	expect(rows[1]).toMatchObject({
		amount: '2',
		unit: 'tbsp',
		name: 'chili powder',
		status: 'Parsed'
	});
	expect(rows[2]).toMatchObject({ amount: '', status: 'No amount' });
	await shot(page, `${CAP}-paste-lines`);

	// Added after existing rows on the edit form.
	await open(page, `/recipes?q=${t('details-2')}`);
	await page.getByRole('link', { name: t('details-2') }).click();
	await openEdit();
	await page.getByLabel('Paste ingredient lines').fill('1 lb ground turkey\nSalt to taste');
	await page.getByRole('button', { name: 'Add lines' }).click();
	const edited = await readRows(page);
	expect(edited).toHaveLength(5);
	expect(edited[3].name).toBe('ground turkey');
	await shot(page, `${CAP}-paste-lines-on-edit`);
});
