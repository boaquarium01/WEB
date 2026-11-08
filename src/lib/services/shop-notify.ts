/**
 * 官網 → GAS 店家通知（寫入 Google 試算表＋Web Push 給夥伴）。
 *
 * 環境變數（未設定時整個功能自動略過，不影響下單）：
 * - SHOP_NOTIFY_URL     GAS Web App 網址（boaquarium01 身分執行的部署 …/exec）
 * - SHOP_NOTIFY_SECRET  與 GAS「指令碼內容」SHOP_NOTIFY_SECRET 相同的共用密碼
 *
 * 呼叫端一律 await，但內部有逾時與錯誤吞噬：通知失敗只記 log，不會讓結帳／回報失敗。
 */
import { getAdminBasePath } from '../admin/path';
import { getOrderForUser } from './order';

export type ShopNotifyEvent = 'SHOP_NEW_ORDER' | 'SHOP_PAYMENT_REPORTED';

const NOTIFY_TIMEOUT_MS = 4000;

function readEnv(name: string): string {
	const fromProcess = typeof process !== 'undefined' ? process.env?.[name] : undefined;
	const fromMeta = (import.meta.env as Record<string, string | undefined> | undefined)?.[name];
	return String(fromProcess ?? fromMeta ?? '').trim();
}

export function isShopNotifyConfigured(): boolean {
	return Boolean(readEnv('SHOP_NOTIFY_URL') && readEnv('SHOP_NOTIFY_SECRET'));
}

async function postToGas(payload: Record<string, unknown>): Promise<void> {
	const url = readEnv('SHOP_NOTIFY_URL');
	const secret = readEnv('SHOP_NOTIFY_SECRET');
	if (!url || !secret) return;
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), NOTIFY_TIMEOUT_MS);
	try {
		const response = await fetch(url, {
			method: 'POST',
			// GAS doPost 讀 e.postData.contents；text/plain 可避免額外的 CORS 預檢
			headers: { 'Content-Type': 'text/plain;charset=utf-8' },
			body: JSON.stringify({ action: 'shopEvent', secret, ...payload }),
			redirect: 'follow',
			signal: controller.signal,
		});
		if (!response.ok) console.warn(`[shop-notify] GAS 回應 HTTP ${response.status}`);
	} finally {
		clearTimeout(timer);
	}
}

/**
 * 依訂單編號組好通知內容後送到 GAS。
 * @param origin 目前網站來源（Astro.url.origin），用來組後台訂單連結
 */
export async function notifyShopEvent(
	event: ShopNotifyEvent,
	userId: string,
	orderNumber: string,
	origin: string,
): Promise<void> {
	if (!isShopNotifyConfigured()) return;
	try {
		const order = await getOrderForUser(userId, orderNumber);
		if (!order) return;
		const address = order.shippingAddress;
		const submission = order.payments[0]?.submissions?.[0];
		const firstItem = order.items[0];
		const itemSummary = firstItem
			? `${firstItem.productName}${firstItem.skuName && firstItem.skuName !== firstItem.productName ? `（${firstItem.skuName}）` : ''} ×${firstItem.quantity}${order.items.length > 1 ? ` 等 ${order.items.length} 項` : ''}`
			: '';
		await postToGas({
			event,
			orderNumber: order.orderNumber,
			customerName: address?.recipientName ?? '',
			phone: address?.phone ?? '',
			total: order.total,
			itemSummary,
			bankLastFive: event === 'SHOP_PAYMENT_REPORTED' ? submission?.bankLastFive ?? '' : '',
			note: event === 'SHOP_PAYMENT_REPORTED' ? submission?.note ?? '' : order.note ?? '',
			adminUrl: new URL(`${getAdminBasePath()}/shop/orders/${encodeURIComponent(order.orderNumber)}`, origin).toString(),
			createdAt: new Date().toISOString(),
		});
	} catch (error) {
		console.error(`[shop-notify] ${event} ${orderNumber} 通知失敗：`, error);
	}
}
