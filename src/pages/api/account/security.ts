import type { APIRoute } from 'astro';
import { eq, and } from 'drizzle-orm';
import { getAuth } from '../../../lib/auth';
import { requireUser, jsonError, hasSameOrigin } from '../../../lib/http';
import { getDb } from '../../../lib/db/client';
import { account } from '../../../lib/db/schema';
import { canUnlinkProvider } from '../../../lib/auth/policies.js';

export const prerender = false;

export const GET: APIRoute = async (context) => {
	const user = requireUser(context);
	if (!user) return jsonError('請先登入', 401);
	const rows = await getDb().select({ id: account.id, providerId: account.providerId, createdAt: account.createdAt }).from(account).where(eq(account.userId, user.id));
	return Response.json({ accounts: rows });
};

export const DELETE: APIRoute = async (context) => {
	if (!hasSameOrigin(context.request, context.url.origin)) return jsonError('請重新整理頁面後再試', 403);
	const user = requireUser(context);
	if (!user) return jsonError('請先登入', 401);
	const body = await context.request.json().catch(() => ({})) as { accountId?: string };
	if (!body.accountId) return jsonError('請選擇要解除的登入方式', 400);
	const [found] = await getDb().select({ id: account.id, providerId: account.providerId }).from(account).where(and(eq(account.id, body.accountId), eq(account.userId, user.id))).limit(1);
	const linked = await getDb().select({ id: account.id }).from(account).where(eq(account.userId, user.id));
	if (!found || !canUnlinkProvider(found.providerId, linked.length)) return jsonError('無法解除此登入方式；請先綁定其他登入方式。', 400);
	try {
		await getAuth().api.unlinkAccount({ body: { accountId: found.id }, headers: context.request.headers });
		return Response.json({ ok: true });
	} catch {
		return jsonError('解除失敗。請先確認帳號仍保留至少一種登入方式。', 400);
	}
};
