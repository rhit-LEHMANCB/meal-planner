import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FB_CLIENT_EMAIL, FB_PRIVATE_KEY } from '$env/static/private';
import { PUBLIC_FB_PROJECT_ID } from '$env/static/public';

if (getApps().length === 0) {
	const { privateKey } = JSON.parse(FB_PRIVATE_KEY);
	initializeApp({
		credential: cert({
			projectId: PUBLIC_FB_PROJECT_ID,
			clientEmail: FB_CLIENT_EMAIL,
			privateKey
		})
	});
}

// Firebase handles sign-in only. All app data lives in Postgres, keyed by the Firebase uid.
export const adminAuth = getAuth();
