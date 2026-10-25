import type { APIRoute } from 'astro';
import { addToCart } from '../../../lib/services/cart';

export const prerender = false;

export const POST: APIRoute = async (context) => {
	const user = context.locals.user;
	const wantsJson = context.request.headers.get('accept')?.includes('application/json');
	const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
	const form = await context.request.formData();
	const returnTo = String(form.get('returnTo') ?? '/cart');
	const productSkuId = String(form.get('productSkuId') ?? '');
	const quantity = Number(form.get('quantity') ?? 1);
	const buyNow = String(form.get('intent') ?? '') === 'buy-now';

	if (!user) {
		const next = encodeURIComponent(returnTo);
		if (wantsJson) return json({ redirect: `/account/login?next=${next}` }, 401);
		return context.redirect(`/account/login?next=${next}`);
	}

	try {
		const cart = await addToCart(user.id, productSkuId, quantity);
		if (wantsJson) return json({ itemCount: cart.itemCount, ...(buyNow ? { redirect: '/checkout' } : {}) });
		if (buyNow) return context.redirect('/checkout');
		const sep = returnTo.includes('?') ? '&' : '?';
		return context.redirect(`${returnTo}${sep}added=1`);
	} catch (error) {
		const message =
			error instanceof Error ? error.message : '加入購物車失敗';
		if (wantsJson) return json({ error: message }, 400);
		const sep = returnTo.includes('?') ? '&' : '?';
		return context.redirect(
			`${returnTo}${sep}error=${encodeURIComponent(message)}`,
		);
	}
};
