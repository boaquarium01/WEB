import type { APIRoute } from 'astro';
import { getAuth } from '../../../lib/auth';
import { safeLocalRedirect } from '../../../lib/auth/policies.js';

export const prerender = false;

export const POST: APIRoute = async (context) => {
	// 後台登出後回到後台登入頁；其他情況回首頁
	let location = '/';
	try {
		const form = await context.request.clone().formData();
		const next = form.get('next');
		if (typeof next === 'string' && next) location = safeLocalRedirect(next, context.url.origin);
	} catch {
		/* 沒有表單內容 */
	}
	try {
		const signedOut = await getAuth().api.signOut({
			headers: context.request.headers,
			asResponse: true,
		});

		const redirect = new Response(null, {
			status: 302,
			headers: {
				Location: location,
			},
		});

		// Preserve Set-Cookie from Better Auth (clear session)
		for (const cookie of signedOut.headers.getSetCookie?.() ?? []) {
			redirect.headers.append('Set-Cookie', cookie);
		}

		// Fallback for runtimes without getSetCookie()
		const single = signedOut.headers.get('set-cookie');
		if (single && !(signedOut.headers.getSetCookie?.().length)) {
			redirect.headers.append('Set-Cookie', single);
		}

		return redirect;
	} catch {
		return context.redirect(location);
	}
};
