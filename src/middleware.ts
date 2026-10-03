import { defineMiddleware } from 'astro:middleware';
import { getAdminPathSlug } from './lib/admin/path';
import { isAdminEmail } from './lib/auth/admin';
import { getAuth } from './lib/auth';
import { getCustomerByUserId } from './lib/services/customer';

const PUBLIC_ACCOUNT_PATHS = new Set([
	'/account/login',
	'/account/register',
	'/account/forgot-password',
	'/account/reset-password',
	'/account/verify-email',
]);

function notFound() {
	return new Response(null, { status: 404, statusText: 'Not Found' });
}

/**
 * Attach session; protect account/cart/checkout.
 * Admin only under `/admin/{ADMIN_PATH_SLUG}/…` (+ optional `/admin` redirect in pages).
 */
export const onRequest = defineMiddleware(async (context, next) => {
	context.locals.user = null;
	context.locals.session = null;
	context.locals.isAdmin = false;

	try {
		const session = await getAuth().api.getSession({
			headers: context.request.headers,
		});

		if (session) {
			context.locals.user = session.user;
			context.locals.session = session.session;
			context.locals.isAdmin = isAdminEmail(session.user.email);
		}
	} catch {
		// Soft-fail when env/DB unavailable.
	}

	const path = context.url.pathname.replace(/\/+$/, '') || '/';
	const isAccountArea = path === '/account' || path.startsWith('/account/');
	const isPublicAccount = PUBLIC_ACCOUNT_PATHS.has(path);
	const isCartArea = path === '/cart' || path.startsWith('/cart/');
	const isCheckoutArea = path === '/checkout' || path.startsWith('/checkout/');

	const slug = getAdminPathSlug();
	const isDev = import.meta.env.DEV;
	const isBareAdmin = path === '/admin';
	const isAdminArea = path === '/admin' || path.startsWith('/admin/');

	if (isAdminArea) {
		// Production: hide bare /admin
		if (!isDev && isBareAdmin) {
			return notFound();
		}
		// Wrong / missing slug → 404 (except bare /admin in DEV, which redirects in page)
		if (!isBareAdmin) {
			if (!slug) return notFound();
			const parts = path.split('/').filter(Boolean);
			// ['admin', slug, ...]
			if (parts[1] !== slug) return notFound();
		}

		if (!context.locals.user) {
			const nextUrl = encodeURIComponent(
				context.url.pathname + context.url.search,
			);
			return context.redirect(`/account/login?next=${nextUrl}`);
		}
		if (!context.locals.isAdmin) {
			return new Response('Forbidden：此帳號沒有後台權限', {
				status: 403,
				headers: { 'Content-Type': 'text/plain; charset=utf-8' },
			});
		}
	}

	if (
		((isAccountArea && !isPublicAccount) || isCartArea || isCheckoutArea) &&
		!context.locals.user
	) {
		const nextUrl = encodeURIComponent(path + context.url.search);
		return context.redirect(`/account/login?next=${nextUrl}`);
	}

	if (context.locals.user && (isAccountArea || isCartArea || isCheckoutArea) && path !== '/account/complete-profile') {
		try {
			const customer = await getCustomerByUserId(context.locals.user.id);
			if (customer && !customer.onboardingCompleted) {
				return context.redirect(`/account/complete-profile?next=${encodeURIComponent(path + context.url.search)}`);
			}
		} catch {
			// Keep auth middleware resilient when the profile store is temporarily unavailable.
		}
	}

	if (
		(path === '/account/login' || path === '/account/register') &&
		context.locals.user
	) {
		return context.redirect('/account');
	}

	return next();
});
