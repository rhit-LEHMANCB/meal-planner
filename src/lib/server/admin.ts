import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { env } from '$env/dynamic/private';
import { PUBLIC_FB_PROJECT_ID } from '$env/static/public';

// Firebase handles sign-in only. All app data lives in Postgres, keyed by the Firebase uid.
// Initialised on first use: secrets are read at runtime, and routes that do not need auth
// (the health check) still work before the Firebase credentials are configured.
export const getAdminAuth = () => {
	if (getApps().length === 0) {
		const { privateKey } = JSON.parse(env.FB_PRIVATE_KEY ?? '');
		initializeApp({
			credential: cert({
				projectId: PUBLIC_FB_PROJECT_ID,
				clientEmail: env.FB_CLIENT_EMAIL,
				privateKey
			})
		});
	}
	return getAuth();
};
