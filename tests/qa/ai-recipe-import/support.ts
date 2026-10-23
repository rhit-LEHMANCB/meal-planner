import { expect, type Locator, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { credentials, open } from '../helpers';

// Lifecycle QA runs set QA_SCREENSHOTS to the change's evidence folder; other runs keep them
// out of the repo.
export const SHOTS = process.env.QA_SCREENSHOTS ?? 'test-results/qa-screenshots/ai-recipe-import';
mkdirSync(SHOTS, { recursive: true });

/** Screenshot with the signed-in email masked. Name: <capability>-<scenario-slug>. */
export const shot = async (page: Page, name: string, full = true) => {
	const creds = credentials();
	const mask: Locator[] = [page.getByText(creds.user.email), page.getByText(creds.other.email)];
	await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: full, mask });
};

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const FIXTURES = join(tmpdir(), 'qa-ai-recipe-import');
mkdirSync(FIXTURES, { recursive: true });

export type Row = {
	amount: string;
	unit: string;
	name: string;
	note: string;
	status: string | null;
};

/** Reads every ingredient row of the form on the page. */
export const readRows = async (page: Page): Promise<Row[]> =>
	page.locator('li[data-row]').evaluateAll((lis) =>
		lis
			.map((li) => {
				const v = (n: string) => (li.querySelector(`input[name="${n}"]`) as HTMLInputElement).value;
				return {
					amount: v('ingredientAmount'),
					unit: v('ingredientUnit'),
					name: v('ingredientName'),
					note: v('ingredientNote'),
					status: li.querySelector('[data-status]')?.textContent?.trim() ?? null
				};
			})
			.filter((r) => r.amount || r.unit || r.name || r.note)
	);

/** Fills ingredient row n (1-based), adding rows when needed. */
export const fillRow = async (
	page: Page,
	n: number,
	r: { amount?: string; unit?: string; name?: string; note?: string }
) => {
	while ((await page.locator('li[data-row]').count()) < n) {
		await page.getByRole('button', { name: 'Add ingredient' }).click();
	}
	const li = page.locator(`li[data-row="${n}"]`);
	if (r.amount !== undefined) await li.locator('input[name="ingredientAmount"]').fill(r.amount);
	if (r.unit !== undefined) await li.locator('input[name="ingredientUnit"]').fill(r.unit);
	if (r.name !== undefined) await li.locator('input[name="ingredientName"]').fill(r.name);
	if (r.note !== undefined) await li.locator('input[name="ingredientNote"]').fill(r.note);
};

export const aiLeft = async (page: Page): Promise<number> => {
	await open(page, '/recipes/import?source=text');
	const t = (await page.getByTestId('ai-left').textContent()) ?? '';
	const m = t.match(/(\d+) of (\d+) AI imports left today/);
	if (!m) throw new Error(`Unexpected counter text: ${t}`);
	return Number(m[1]);
};

export const counterText = async (page: Page) =>
	((await page.getByTestId('ai-left').textContent()) ?? '').trim();

/**
 * Runs `act` (which submits an import) and waits for either an alert or the review. If the
 * per-user cooldown message appears, waits out the 10 seconds and tries again. Returns what
 * happened, and how many cooldown refusals were seen on the way.
 */
export const submitImport = async (
	page: Page,
	act: () => Promise<void>
): Promise<{ alert: string | null; review: boolean; cooldowns: number }> => {
	let cooldowns = 0;
	for (let i = 0; i < 4; i++) {
		await act();
		const alert = page.getByRole('alert').first();
		const review = page.getByRole('region', { name: 'Imported recipe' });
		await expect(alert.or(review)).toBeVisible({ timeout: 55_000 });
		if (await review.isVisible()) return { alert: null, review: true, cooldowns };
		const text = ((await alert.textContent()) ?? '').trim();
		if (/wait a few seconds/i.test(text)) {
			cooldowns++;
			await sleep(11_000);
			continue;
		}
		return { alert: text, review: false, cooldowns };
	}
	throw new Error('Cooldown never cleared');
};

export const importLink = async (page: Page, url: string) =>
	submitImport(page, async () => {
		await open(page, '/recipes/import?source=link');
		await page.getByLabel('Recipe link').fill(url);
		await page.evaluate(() => document.querySelector('form')?.setAttribute('novalidate', ''));
		await page.getByRole('button', { name: 'Import link' }).click();
	});

export const importText = async (page: Page, text: string, fresh = true) =>
	submitImport(page, async () => {
		if (fresh) await open(page, '/recipes/import?source=text');
		await page.getByLabel('Recipe text').fill(text);
		await page.getByRole('button', { name: 'Import text' }).click();
	});

export const importPhoto = async (
	page: Page,
	file: { name: string; mimeType: string; buffer: Buffer } | string
) =>
	submitImport(page, async () => {
		await open(page, '/recipes/import?source=photo');
		await page.getByLabel('Photo of the recipe').setInputFiles(file);
		await expect(page.getByRole('button', { name: 'Import photo' })).toBeEnabled({
			timeout: 30_000
		});
		await page.getByRole('button', { name: 'Import photo' }).click();
	});

/** Renders a recipe card to a PNG (and optionally a big noisy JPEG) with the browser. */
export const makeRecipeImages = async (page: Page) => {
	const png = join(FIXTURES, 'qa-recipe-card.png');
	const big = join(FIXTURES, 'qa-recipe-big.jpg');
	await page.setContent(`<body style="margin:0;background:#fff"><div id="c" style="width:720px;padding:32px;font:28px/1.4 Georgia,serif;color:#000;background:#fff">
<h1 style="font-size:44px;margin:0 0 12px">Lemon Pasta</h1>
<p>Serves 2. Ready in 20 minutes.</p><h2>Ingredients</h2>
<ul><li>200 g spaghetti</li><li>2 tbsp olive oil</li><li>1 lemon, juiced</li><li>Salt to taste</li></ul>
<h2>Steps</h2><ol><li>Boil the spaghetti until tender.</li><li>Toss with oil and lemon juice.</li></ol></div></body>`);
	await page.locator('#c').screenshot({ path: png });

	const dataUrl = await page.evaluate(async () => {
		const w = 4000;
		const h = 3000;
		const c = document.createElement('canvas');
		c.width = w;
		c.height = h;
		const ctx = c.getContext('2d')!;
		const img = ctx.createImageData(w, h);
		for (let i = 0; i < img.data.length; i += 4) {
			img.data[i] = Math.random() * 255;
			img.data[i + 1] = Math.random() * 255;
			img.data[i + 2] = Math.random() * 255;
			img.data[i + 3] = 255;
		}
		ctx.putImageData(img, 0, 0);
		ctx.fillStyle = '#fff';
		ctx.fillRect(300, 300, 3400, 1800);
		ctx.fillStyle = '#000';
		ctx.font = 'bold 150px Georgia, serif';
		const lines = [
			'Lemon Pasta (serves 2)',
			'200 g spaghetti',
			'2 tbsp olive oil',
			'1 lemon, juiced',
			'Boil spaghetti. Toss with oil and lemon.'
		];
		lines.forEach((l, i) => ctx.fillText(l, 400, 520 + i * 320));
		return c.toDataURL('image/jpeg', 0.95);
	});
	writeFileSync(big, Buffer.from(dataUrl.split(',')[1], 'base64'));
	return { png, big };
};
