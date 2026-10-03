import 'dotenv/config';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;

if (!url) {
	console.error('DATABASE_URL is missing. Copy .env.example to .env and fill values.');
	process.exit(1);
}

const sql = postgres(url, { max: 1 });

try {
	const started = Date.now();
	const rows = await sql`select 1 as ok, now() as server_time`;
	console.log('PostgreSQL connection OK');
	console.log({
		latencyMs: Date.now() - started,
		result: rows[0],
	});
} catch (error) {
	console.error('PostgreSQL connection failed');
	console.error(error);
	process.exitCode = 1;
} finally {
	await sql.end({ timeout: 5 });
}
