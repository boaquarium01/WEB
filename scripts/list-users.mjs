import 'dotenv/config';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });

try {
	console.log('ADMIN_EMAILS=', process.env.ADMIN_EMAILS);
	const users = await sql`select email, name from "user" order by created_at desc limit 10`;
	console.log(users);
} finally {
	await sql.end({ timeout: 5 });
}
