import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import { getServerEnv } from '../env';
import * as schema from './schema';

type Db = ReturnType<typeof createDb>;

let client: ReturnType<typeof postgres> | null = null;
let db: Db | null = null;

function createDb() {
	const { DATABASE_URL } = getServerEnv();
	client = postgres(DATABASE_URL, {
		max: 10,
		prepare: false,
	});
	return drizzle(client, { schema });
}

/**
 * Server-only PostgreSQL client (Drizzle).
 * Never import this module from client-side code.
 */
export function getDb(): Db {
	if (!db) {
		db = createDb();
	}
	return db;
}

export async function pingDatabase(): Promise<{ ok: true; latencyMs: number }> {
	const started = Date.now();
	await getDb().execute(sql`select 1`);
	return { ok: true, latencyMs: Date.now() - started };
}

export async function closeDb(): Promise<void> {
	if (client) {
		await client.end({ timeout: 5 });
		client = null;
		db = null;
	}
}
