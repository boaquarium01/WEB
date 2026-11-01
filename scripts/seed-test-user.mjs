/**
 * 建立（或重設）V2 測試會員：Email 已驗證、密碼登入、已同意條款。
 * 帳密讀 .env 的 TEST_LOGIN_EMAIL / TEST_LOGIN_PASSWORD；重跑會把密碼重設成 .env 的值。
 * 只用在 V2 測試資料庫。
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { hashPassword } from 'better-auth/crypto';

const email = String(process.env.TEST_LOGIN_EMAIL ?? '').trim().toLowerCase();
const password = String(process.env.TEST_LOGIN_PASSWORD ?? '');
if (!email || password.length < 8) {
	console.error('請先在 .env 設定 TEST_LOGIN_EMAIL 與 TEST_LOGIN_PASSWORD（至少 8 碼）');
	process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });

try {
	const hash = await hashPassword(password);
	await sql.begin(async (tx) => {
		let [row] = await tx`select id from "user" where email = ${email}`;
		const userId = row?.id ?? randomUUID();
		if (!row) {
			await tx`insert into "user" (id, name, email, email_verified) values (${userId}, '測試會員', ${email}, true)`;
		} else {
			await tx`update "user" set email_verified = true, updated_at = now() where id = ${userId}`;
		}
		const [credential] = await tx`select id from account where user_id = ${userId} and provider_id = 'credential'`;
		if (credential) {
			await tx`update account set password = ${hash}, updated_at = now() where id = ${credential.id}`;
		} else {
			await tx`insert into account (id, account_id, provider_id, user_id, password) values (${randomUUID()}, ${userId}, 'credential', ${userId}, ${hash})`;
		}
		const [customer] = await tx`select id from customers where user_id = ${userId}`;
		if (!customer) {
			await tx`insert into customers (user_id, display_name, contact_email, terms_accepted_at, onboarding_completed) values (${userId}, '測試會員', ${email}, now(), true)`;
		}
		console.log(`測試會員已就緒：${email}（${row ? '已重設密碼' : '新建立'}）`);
	});
} finally {
	await sql.end({ timeout: 5 });
}
