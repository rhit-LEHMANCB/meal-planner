/** Photos are shrunk in the browser to this many pixels on the long side before upload. */
export const PHOTO_MAX_SIDE = 1600;

/** Files smaller than this are sent as they are when they also fit within PHOTO_MAX_SIDE. */
export const PHOTO_RESIZE_BYTES = 1.5 * 1024 * 1024;

/** True when a photo should be shrunk before upload. */
export const needsResize = (width: number, height: number, bytes: number): boolean =>
	Math.max(width, height) > PHOTO_MAX_SIDE || bytes > PHOTO_RESIZE_BYTES;

/** The size to draw a photo at: at most PHOTO_MAX_SIDE on the long side, same proportions. */
export const targetSize = (width: number, height: number): { width: number; height: number } => {
	const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(width, height));
	return { width: Math.round(width * scale), height: Math.round(height * scale) };
};
