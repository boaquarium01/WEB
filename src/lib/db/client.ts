import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import { getServerEnv } from '../env';
import { getRequestScope } from '../request-scope';
import * as schema from './schema';

type Db = ReturnType<typeof createDb>;

let client: ReturnType<typeof postgres> | null = null;
let db: Db | null = null;

function createClient(url: string, max: number) {
	return postgres(url, { max, prepare: false, fetch_types: false });
}

function createDb(sqlClient: ReturnType<typeof postgres>) {
	return drizzle(sqlClient, { schema });
}

/**
 * Server-only PostgreSQL client (Drizzle).
 * Never import this module from client-side code.
 */
export function getDb(): Db {
	const scope = getRequestScope();
	if (scope) {
		// Workers：每次請求各自連線（一個 Worker 同時最多 6 條對外連線）
		scope.db ??= createDb(createClient(scope.databaseUrl ?? getServerEnv().DATABASE_URL, 5));
		return scope.db as Db;
	}
	if (!db) {
		client = createClient(getServerEnv().DATABASE_URL, 10);
		db = createDb(client);
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
