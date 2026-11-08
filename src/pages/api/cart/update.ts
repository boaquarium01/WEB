import type { APIRoute } from 'astro';
import { updateCartItemQuantity } from '../../../lib/services/cart';

export const prerender = false;

/** 購物車頁按 +／− 時背景更新數量，不重新載入整頁 */
export const POST: APIRoute = async ({ locals, request }) => {
	const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
	if (!locals.user) return json({ error: '請先登入' }, 401);
	let cartItemId = '';
	let quantity = Number.NaN;
	try {
		const body = (await request.json()) as { cartItemId?: unknown; quantity?: unknown };
		cartItemId = String(body.cartItemId ?? '');
		quantity = Number(body.quantity);
	} catch {
		return json({ error: '資料格式錯誤' }, 400);
	}
	try {
		const cart = await updateCartItemQuantity(locals.user.id, cartItemId, quantity);
		return json({ ok: true, itemCount: cart.itemCount });
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : '數量更新失敗' }, 400);
	}
};
