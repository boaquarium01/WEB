import type { APIRoute } from 'astro';
import { hasSameOrigin, jsonError, jsonOk, requireUser } from '../../../lib/http';
import { isPushConfigured, removePushSubscription, savePushSubscription, type BrowserSubscription } from '../../../lib/services/push';

export const prerender = false;

/** 儲存這台裝置的推播訂閱（需登入） */
export const POST: APIRoute = async (context) => {
	const user = requireUser(context);
	if (!user) return jsonError('請先登入', 401);
	if (!hasSameOrigin(context.request, context.url.origin)) return jsonError('Forbidden', 403);
	if (!isPushConfigured()) return jsonError('推播功能尚未設定', 503);

	const body = (await context.request.json().catch(() => null)) as { subscription?: BrowserSubscription } | null;
	const sub = body?.subscription;
	if (!sub?.endpoint?.startsWith('https://') || !sub.keys?.p256dh || !sub.keys?.auth || sub.endpoint.length > 2048) {
		return jsonError('訂閱資料不正確');
	}
	await savePushSubscription(user.id, sub, context.request.headers.get('user-agent')?.slice(0, 300) ?? null);
	return jsonOk({ subscribed: true });
};

/** 取消這台裝置的推播訂閱 */
export const DELETE: APIRoute = async (context) => {
	const user = requireUser(context);
	if (!user) return jsonError('請先登入', 401);
	if (!hasSameOrigin(context.request, context.url.origin)) return jsonError('Forbidden', 403);

	const body = (await context.request.json().catch(() => null)) as { endpoint?: string } | null;
	if (!body?.endpoint) return jsonError('缺少裝置資料');
	await removePushSubscription(user.id, body.endpoint);
	return jsonOk({ subscribed: false });
};
