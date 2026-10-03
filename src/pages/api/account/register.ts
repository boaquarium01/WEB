import type { APIRoute } from 'astro';
import { getAuth } from '../../../lib/auth';
import { jsonError } from '../../../lib/http';
import { isAuthEmailConfigured } from '../../../lib/email/adapter';
import { getDb } from '../../../lib/db/client';
import { customers } from '../../../lib/db/schema';
import { eq } from 'drizzle-orm';

export const prerender = false;

export const POST: APIRoute = async (context) => {
	const contentType = context.request.headers.get('content-type') ?? '';
	let email = '';
	let password = '';
	let name = '';
	let acceptedTerms = false;
	let confirmPassword = '';

	try {
		if (contentType.includes('application/json')) {
			const body = (await context.request.json()) as {
				email?: string;
				password?: string;
				name?: string;
				acceptedTerms?: boolean;
				confirmPassword?: string;
			};
			email = body.email?.trim() ?? '';
			password = body.password ?? '';
			name = body.name?.trim() ?? '';
			acceptedTerms = body.acceptedTerms === true;
			confirmPassword = body.confirmPassword ?? '';
		} else {
			const form = await context.request.formData();
			email = String(form.get('email') ?? '').trim();
			password = String(form.get('password') ?? '');
			name = String(form.get('name') ?? '').trim();
			acceptedTerms = form.get('acceptedTerms') === 'on';
			confirmPassword = String(form.get('confirmPassword') ?? '');
		}
	} catch {
		return jsonError('Invalid request body');
	}

	if (!email || !password || !name || !acceptedTerms) {
		return jsonError('請填寫姓名、Email、密碼並同意服務條款');
	}
	if (!confirmPassword || password !== confirmPassword) return jsonError('兩次輸入的密碼不一致');
	if (!isAuthEmailConfigured()) return jsonError('目前尚未設定驗證信服務，請稍後再試。', 503);

	if (password.length < 8) {
		return jsonError('密碼至少 8 個字元');
	}

	try {
		const response = await getAuth().api.signUpEmail({
			body: { email, password, name },
			headers: context.request.headers,
			asResponse: true,
		});
		if (!response.ok) return Response.json({ ok: true, message: '若可建立帳戶，驗證信將寄出，請查看信箱。' });
		const payload = await response.clone().json().catch(() => null) as { user?: { id?: string } } | null;
		if (payload?.user?.id) {
			await getDb().update(customers).set({ termsAcceptedAt: new Date(), updatedAt: new Date() }).where(eq(customers.userId, payload.user.id));
		}
		return response;
	} catch {
		return Response.json({ ok: true, message: '若可建立帳戶，驗證信將寄出，請查看信箱。' });
	}
};
