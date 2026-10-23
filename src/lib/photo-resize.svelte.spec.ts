// Runs in the browser test project (the .svelte.spec name puts it there): canvas and
// createImageBitmap only exist in a real browser.
import { describe, expect, it } from 'vitest';
import { shrinkPhoto } from './photo-resize';

const photo = async (width: number, height: number, type = 'image/png') => {
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d')!;
	ctx.fillStyle = '#2f6b4f';
	ctx.fillRect(0, 0, width, height);
	const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), type));
	return new File([blob], 'card.png', { type });
};

const size = async (file: File) => {
	const bitmap = await createImageBitmap(file);
	return { width: bitmap.width, height: bitmap.height };
};

describe('shrinkPhoto', () => {
	it('shrinks a large photo to a 1600 px JPEG with the same proportions', async () => {
		const smaller = await shrinkPhoto(await photo(3200, 2400));
		expect(smaller.type).toBe('image/jpeg');
		expect(smaller.name).toBe('card.jpg');
		expect(await size(smaller)).toEqual({ width: 1600, height: 1200 });
	});

	it('leaves a small photo as it is', async () => {
		const original = await photo(800, 600);
		expect(await shrinkPhoto(original)).toBe(original);
	});

	it('leaves a file the browser cannot decode for the server to judge', async () => {
		const notAnImage = new File(['hello'], 'card.heic', { type: 'image/heic' });
		expect(await shrinkPhoto(notAnImage)).toBe(notAnImage);
	});
});
