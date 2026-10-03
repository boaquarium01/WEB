import type { APIRoute } from 'astro';
import { addToCart } from '../../../lib/services/cart';

export const prerender = false;

export const POST: APIRoute = async (context) => {
	const user = context.locals.user;
	const form = await context.request.formData();
	const returnTo = String(form.get('returnTo') ?? '/cart');
	const productSkuId = String(form.get('productSkuId') ?? '');
	const quantity = Number(form.get('quantity') ?? 1);

	if (!user) {
		const next = encodeURIComponent(returnTo);
		return context.redirect(`/account/login?next=${next}`);
	}

	try {
		await addToCart(user.id, productSkuId, quantity);
		const sep = returnTo.includes('?') ? '&' : '?';
		return context.redirect(`${returnTo}${sep}added=1`);
	} catch (error) {
		const message =
			error instanceof Error ? error.message : '加入購物車失敗';
		const sep = returnTo.includes('?') ? '&' : '?';
		return context.redirect(
			`${returnTo}${sep}error=${encodeURIComponent(message)}`,
		);
	}
};
