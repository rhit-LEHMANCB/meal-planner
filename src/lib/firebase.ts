import { getApps, initializeApp } from 'firebase/app';
import { getAuth, inMemoryPersistence, setPersistence } from 'firebase/auth';
import {
	PUBLIC_FB_API_KEY,
	PUBLIC_FB_APP_ID,
	PUBLIC_FB_AUTH_DOMAIN,
	PUBLIC_FB_PROJECT_ID
} from '$env/static/public';

const app =
	getApps()[0] ??
	initializeApp({
		apiKey: PUBLIC_FB_API_KEY,
		authDomain: PUBLIC_FB_AUTH_DOMAIN,
		projectId: PUBLIC_FB_PROJECT_ID,
		appId: PUBLIC_FB_APP_ID
	});

// The httpOnly `__session` cookie carries the session; the client SDK only signs in.
export const auth = getAuth(app);
setPersistence(auth, inMemoryPersistence);
