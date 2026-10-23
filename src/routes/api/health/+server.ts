import { json } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import { getDb } from '$lib/server/db';

export const GET = async () => {
	try {
		await getDb().execute(sql`select 1`);
		return json({ db: 'ok' });
	} catch (err) {
		console.error('Health check failed', err);
		return json({ db: 'down' }, { status: 503 });
	}
};
