import { redirect } from '@sveltejs/kit';
import { endSession } from '$lib/server/session';

export const POST = async ({ cookies }) => {
	endSession(cookies);
	throw redirect(303, '/signin');
};
