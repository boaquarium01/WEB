/**
 * 寄一則測試推播給指定會員的所有已開啟通知的裝置（不會改動任何訂單）。
 * 用法：npm run push:test -- you@example.com
 */
import 'dotenv/config';
import postgres from 'postgres';
import { sendOrderPush } from '../src/lib/services/push';

async function main() {
	const email = String(process.argv[2] ?? '').trim().toLowerCase();
	if (!email) throw new Error('請提供會員 Email，例如：npm run push:test -- you@example.com');
	const sql = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });
	try {
		const [member] = await sql`select id from "user" where lower(email) = ${email}`;
		if (!member) throw new Error(`找不到會員：${email}`);
		const [{ n }] = await sql`select count(*)::int n from push_subscriptions where user_id = ${member.id} and wants_order = true`;
		console.log(`已開啟通知的裝置：${n} 台`);
		const sent = await sendOrderPush(member.id, { title: '水博館水族 測試通知', body: '看到這則通知，代表推播設定成功 🐟', url: '/account/orders' });
		console.log(`成功送出：${sent} 台`);
	} finally {
		await sql.end({ timeout: 5 });
	}
}

main().then(() => process.exit(0)).catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
