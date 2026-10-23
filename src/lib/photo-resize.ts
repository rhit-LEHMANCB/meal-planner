import { needsResize, targetSize } from '$lib/domain/photo-size';

/**
 * Shrinks a large photo in the browser (at most 1600 px, JPEG) so phone photos fit the upload
 * limit and cost less to parse. Returns the original file when it is small enough or when the
 * browser cannot decode it (the server then decides).
 */
export const shrinkPhoto = async (file: File): Promise<File> => {
	let bitmap: ImageBitmap;
	try {
		bitmap = await createImageBitmap(file);
	} catch {
		return file;
	}
	try {
		if (!needsResize(bitmap.width, bitmap.height, file.size)) return file;
		const { width, height } = targetSize(bitmap.width, bitmap.height);
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		canvas.getContext('2d')?.drawImage(bitmap, 0, 0, width, height);
		const blob = await new Promise<Blob | null>((resolve) =>
			canvas.toBlob(resolve, 'image/jpeg', 0.85)
		);
		if (!blob) return file;
		return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
	} finally {
		bitmap.close();
	}
};
