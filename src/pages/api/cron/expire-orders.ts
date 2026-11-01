import type { APIRoute } from 'astro';
import { cancelExpiredUnpaidOrders } from '../../../lib/services/admin-orders';

export const prerender = false;

/**
 * 逾期未付款訂單自動取消（釋放預留庫存）。
 * - Vercel Cron 每天呼叫一次（vercel.json），自動帶 Authorization: Bearer ${CRON_SECRET}
 * - 未設定 CRON_SECRET 時一律拒絕，避免被任何人觸發
 */
export const GET: APIRoute = async ({ request }) => {
	const secret = String(process.env.CRON_SECRET ?? import.meta.env.CRON_SECRET ?? '').trim();
	const auth = request.headers.get('authorization') ?? '';
	if (!secret || auth !== `Bearer ${secret}`) {
		return new Response(JSON.stringify({ ok: false, message: 'Unauthorized' }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' },
		});
	}
	const cancelled = await cancelExpiredUnpaidOrders();
	if (cancelled.length) console.info(`[expire-orders] 已自動取消 ${cancelled.length} 筆：${cancelled.join(', ')}`);
	return new Response(JSON.stringify({ ok: true, cancelled }), {
		headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
	});
};
