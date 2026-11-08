import type { APIRoute } from 'astro';
import { getAuth } from '../../../lib/auth';
import { authRequest, jsonError } from '../../../lib/http';
import { normalizeTaiwanMobile, passwordPolicyMessage } from '../../../lib/auth/policies.js';
import { isPhoneTaken } from '../../../lib/services/customer';
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
	let phoneInput = '';

	try {
		if (contentType.includes('application/json')) {
			const body = (await context.request.json()) as {
				email?: string;
				password?: string;
				name?: string;
				acceptedTerms?: boolean;
				confirmPassword?: string;
				phone?: string;
			};
			email = body.email?.trim() ?? '';
			password = body.password ?? '';
			name = body.name?.trim() ?? '';
			acceptedTerms = body.acceptedTerms === true;
			confirmPassword = body.confirmPassword ?? '';
			phoneInput = body.phone ?? '';
		} else {
			const form = await context.request.formData();
			email = String(form.get('email') ?? '').trim();
			password = String(form.get('password') ?? '');
			name = String(form.get('name') ?? '').trim();
			acceptedTerms = form.get('acceptedTerms') === 'on';
			confirmPassword = String(form.get('confirmPassword') ?? '');
			phoneInput = String(form.get('phone') ?? '');
		}
	} catch {
		return jsonError('Invalid request body');
	}

	if (!email || !password || !name || !acceptedTerms) {
		return jsonError('請填寫姓名、Email、密碼並同意服務條款');
	}
	const phone = normalizeTaiwanMobile(phoneInput);
	if (!phone) return jsonError('請輸入正確的手機號碼，例如 0912345678');
	if (!confirmPassword || password !== confirmPassword) return jsonError('兩次輸入的密碼不一致');
	if (!isAuthEmailConfigured()) return jsonError('目前尚未設定驗證信服務，請稍後再試。', 503);

	const passwordProblem = passwordPolicyMessage(password);
	if (passwordProblem) return jsonError(passwordProblem);
	if (await isPhoneTaken(phone)) return jsonError('這支手機號碼已註冊過，請直接登入，或改用其他號碼');

	try {
		const response = await getAuth().handler(authRequest(context, '/sign-up/email', { email, password, name }));
		if (response.status === 429) return jsonError('嘗試次數太多，請稍候一分鐘再試。', 429);
		if (!response.ok) return Response.json({ ok: true, message: '若可建立帳戶，驗證信將寄出，請查看信箱。' });
		const payload = await response.clone().json().catch(() => null) as { user?: { id?: string } } | null;
		if (payload?.user?.id) {
			await getDb().update(customers).set({ phone, termsAcceptedAt: new Date(), updatedAt: new Date() }).where(eq(customers.userId, payload.user.id));
		}
		return response;
	} catch {
		return Response.json({ ok: true, message: '若可建立帳戶，驗證信將寄出，請查看信箱。' });
	}
};
