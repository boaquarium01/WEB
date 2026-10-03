import type { APIRoute } from 'astro';
import { getAuth } from '../../../lib/auth';
import { jsonError } from '../../../lib/http';
import { safeLocalRedirect } from '../../../lib/auth/policies.js';

export const prerender = false;

export const POST: APIRoute = async (context) => {
	const contentType = context.request.headers.get('content-type') ?? '';
	const isJson = contentType.includes('application/json');
	let email = '';
	let password = '';
	let next = '/account';
	let safeNext = '/account';

	try {
		if (isJson) {
			const body = (await context.request.json()) as {
				email?: string;
				password?: string;
				next?: string;
			};
			email = body.email?.trim() ?? '';
			password = body.password ?? '';
			next = body.next ?? next;
		} else {
			const form = await context.request.formData();
			email = String(form.get('email') ?? '').trim();
			password = String(form.get('password') ?? '');
			next = String(form.get('next') ?? next);
		}
	} catch {
		return jsonError('Invalid request body');
	}

	if (!email || !password) {
		return isJson
			? jsonError('請填寫 Email 與密碼')
			: context.redirect(`/account/login?error=${encodeURIComponent('請填寫 Email 與密碼')}`, 303);
	}
	safeNext = safeLocalRedirect(next, context.url.origin);

	try {
		const response = await getAuth().api.signInEmail({
			body: { email, password },
			headers: context.request.headers,
			asResponse: true,
		});
		if (!isJson) {
			if (!response.ok) {
				const message = '登入失敗或 Email 尚未驗證，請確認資料；需要時可重新寄送驗證信。';
				return context.redirect(`/account/login?error=${encodeURIComponent(message)}&next=${encodeURIComponent(safeNext)}`, 303);
			}
			const headers = new Headers(response.headers);
			headers.set('Location', safeNext);
			return new Response(null, { status: 303, headers });
		}
		if (!response.ok) return jsonError('登入失敗或 Email 尚未驗證，請確認資料；需要時可重新寄送驗證信。', 401);
		return response;
	} catch {
		const message = '登入失敗或 Email 尚未驗證，請確認資料；需要時可重新寄送驗證信。';
		return isJson
			? jsonError(message, 401)
			: context.redirect(`/account/login?error=${encodeURIComponent(message)}&next=${encodeURIComponent(safeNext)}`, 303);
	}
};
