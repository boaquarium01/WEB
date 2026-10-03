import 'dotenv/config';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;

if (!url) {
	console.error('DATABASE_URL is missing.');
	process.exit(1);
}

const sql = postgres(url, { max: 1, prepare: false });

try {
	const existing = await sql`
		select id, name, type, is_active, created_at
		from locations
		where type = 'STORE'
		limit 1
	`;

	if (existing.length > 0) {
		console.log('STORE location already exists:', existing[0]);
	} else {
		const created = await sql`
			insert into locations (name, type, is_active)
			values ('水博館門市', 'STORE', true)
			returning id, name, type, is_active, created_at
		`;
		console.log('Seeded STORE location:', created[0]);
	}
} catch (error) {
	console.error('Seed failed:', error);
	process.exitCode = 1;
} finally {
	await sql.end({ timeout: 5 });
}
