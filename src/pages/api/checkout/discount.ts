import type { APIRoute } from 'astro';
import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '../../../lib/db/client';
import { products, shippingMethods } from '../../../lib/db/schema';
import { getCartView } from '../../../lib/services/cart';
import { DiscountError, findAutoDiscount, quoteDiscount } from '../../../lib/services/discounts';

export const prerender = false;

/** 結帳頁試算折扣碼：回傳折抵後的運費與總額（實際下單時會再檢查一次） */
export const POST: APIRoute = async ({ locals, request }) => {
	const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
	const user = locals.user;
	if (!user) return json({ error: '請先登入' }, 401);
	let body: { code?: unknown; shippingMethodId?: unknown; cartItemIds?: unknown; auto?: unknown };
	try {
		body = await request.json();
	} catch {
		return json({ error: '資料格式錯誤' }, 400);
	}
	try {
		const db = getDb();
		const cart = await getCartView(user.id);
		const selected = Array.isArray(body.cartItemIds) ? new Set(body.cartItemIds.map(String)) : null;
		const items = selected ? cart.items.filter((item) => selected.has(item.cartItemId)) : cart.items;
		if (!items.length) return json({ error: '購物車是空的' }, 400);
		const [method] = await db.select({ fee: shippingMethods.fee, freeShippingThreshold: shippingMethods.freeShippingThreshold })
			.from(shippingMethods)
			.where(and(eq(shippingMethods.id, String(body.shippingMethodId ?? '')), eq(shippingMethods.isActive, true)))
			.limit(1);
		if (!method) return json({ error: '請先選擇配送方式' }, 400);
		const types = await db.select({ id: products.id, productType: products.productType }).from(products).where(inArray(products.id, [...new Set(items.map((item) => item.productId))]));
		const typeById = new Map(types.map((row) => [row.id, row.productType]));
		const lines = items.map((item) => ({ productType: typeById.get(item.productId) ?? null, lineSubtotal: item.lineTotal }));
		// auto：找出符合條件、會自動套用的折扣碼（沒有就回傳 none）
		if (body.auto === true) {
			const best = await findAutoDiscount(db, { userId: user.id, lines, shippingMethod: method });
			if (!best) return json({ ok: true, none: true });
			return json({ ok: true, auto: true, code: best.code, label: best.label, discount: best.discount, shippingFee: best.shippingFee, total: best.total });
		}
		const quote = await quoteDiscount(db, { code: String(body.code ?? ''), userId: user.id, lines, shippingMethod: method });
		return json({ ok: true, code: quote.code, label: quote.label, discount: quote.discount, shippingFee: quote.shippingFee, total: quote.total });
	} catch (error) {
		if (error instanceof DiscountError) return json({ error: error.message }, 400);
		console.error('[checkout] discount quote failed', error);
		return json({ error: '折扣碼暫時無法使用，請稍後再試' }, 500);
	}
};
