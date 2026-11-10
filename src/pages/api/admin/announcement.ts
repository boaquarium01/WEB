import type { APIRoute } from 'astro';
import { saveAnnouncementBar } from '../../../lib/services/announcement';

export const prerender = false;

/** 後台儲存頂部公告條（/api/admin/* 已由 middleware 檢查管理員） */
export const POST: APIRoute = async ({ locals, request }) => {
	const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
	if (!locals.user || !locals.isAdmin) return json({ error: '沒有權限' }, 403);
	try {
		const value = await saveAnnouncementBar(await request.json(), String(locals.user.email ?? ''));
		return json({ ok: true, value });
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : '儲存失敗' }, 400);
	}
};
