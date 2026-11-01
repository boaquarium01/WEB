/**
 * 網頁推播（顧客端）：訂閱管理與發送。
 *
 * 環境變數（未設定時整個功能自動略過，不影響下單與後台操作）：
 * - VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY  推播金鑰（npx web-push generate-vapid-keys）
 * - VAPID_SUBJECT                         聯絡方式，例如 mailto:you@example.com
 */
import webpush from 'web-push';
import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '../db/client';
import { pushSubscriptions } from '../db/schema';

function readEnv(name: string): string {
	const fromProcess = typeof process !== 'undefined' ? process.env?.[name] : undefined;
	const fromMeta = (import.meta.env as Record<string, string | undefined> | undefined)?.[name];
	return String(fromProcess ?? fromMeta ?? '').trim();
}

export function getVapidPublicKey(): string {
	return readEnv('VAPID_PUBLIC_KEY');
}

export function isPushConfigured(): boolean {
	return Boolean(readEnv('VAPID_PUBLIC_KEY') && readEnv('VAPID_PRIVATE_KEY'));
}

let vapidReady = false;
function ensureVapid(): boolean {
	if (vapidReady) return true;
	if (!isPushConfigured()) return false;
	webpush.setVapidDetails(readEnv('VAPID_SUBJECT') || 'mailto:noreply@example.com', readEnv('VAPID_PUBLIC_KEY'), readEnv('VAPID_PRIVATE_KEY'));
	vapidReady = true;
	return true;
}

export type BrowserSubscription = { endpoint: string; keys: { p256dh: string; auth: string } };

export async function savePushSubscription(userId: string, subscription: BrowserSubscription, userAgent: string | null): Promise<void> {
	const db = getDb();
	await db
		.insert(pushSubscriptions)
		.values({ userId, endpoint: subscription.endpoint, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth, userAgent, wantsOrder: true })
		// 同一台裝置換了登入帳號時，訂閱改歸目前的會員
		.onConflictDoUpdate({
			target: pushSubscriptions.endpoint,
			set: { userId, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth, userAgent, wantsOrder: true },
		});
}

export async function removePushSubscription(userId: string, endpoint: string): Promise<void> {
	await getDb().delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));
}

export type PushMessage = { title: string; body: string; url: string; tag?: string };

/**
 * 推播給某位會員所有「開啟訂單通知」的裝置。失敗只記 log，不會讓呼叫端（後台操作）失敗；
 * 裝置已取消授權（404／410）時自動刪除該筆訂閱。
 */
export async function sendOrderPush(userId: string, message: PushMessage): Promise<number> {
	if (!ensureVapid()) return 0;
	try {
		const db = getDb();
		const rows = await db
			.select()
			.from(pushSubscriptions)
			.where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.wantsOrder, true)));
		if (!rows.length) return 0;
		const payload = JSON.stringify({ ...message, icon: '/web-app-manifest-192x192.png', badge: '/favicon-96x96.png' });
		const gone: string[] = [];
		let sent = 0;
		await Promise.all(rows.map(async (row) => {
			try {
				await webpush.sendNotification({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, payload, { TTL: 60 * 60 * 24, timeout: 5000 });
				sent += 1;
			} catch (error) {
				const status = (error as { statusCode?: number }).statusCode;
				if (status === 404 || status === 410) gone.push(row.id);
				else console.error('[push] 發送失敗：', status ?? error);
			}
		}));
		if (gone.length) await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, gone));
		if (sent) await db.update(pushSubscriptions).set({ lastSentAt: new Date() }).where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.wantsOrder, true)));
		return sent;
	} catch (error) {
		console.error('[push] sendOrderPush 失敗：', error);
		return 0;
	}
}
