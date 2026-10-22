import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	DATABASE_URL: { description: 'Neon pooled Postgres connection string.' },
	ANTHROPIC_API_KEY: { description: 'Anthropic API key for recipe import.' },
	FB_CLIENT_EMAIL: { description: 'Firebase Admin service account client email.' },
	FB_PRIVATE_KEY: {
		description: 'Firebase Admin private key, as JSON: {"privateKey":"-----BEGIN..."}.'
	},
	PUBLIC_FB_PROJECT_ID: { public: true, description: 'Firebase project id.' },
	PUBLIC_FB_API_KEY: { public: true, description: 'Firebase web API key.' },
	PUBLIC_FB_AUTH_DOMAIN: { public: true, description: 'Firebase auth domain.' },
	PUBLIC_FB_APP_ID: { public: true, description: 'Firebase web app id.' }
});
