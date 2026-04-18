import type { APIRoute } from 'astro';
import { runSanityDashboardRequest, readSanityWriteToken } from '../../../lib/admin/sanityDashboardServer';

function resolveToken(request: Request): string {
	const env = readSanityWriteToken();
	const header = request.headers.get('x-admin-token')?.trim();
	const auth = request.headers.get('authorization')?.trim();
	const bearer = auth?.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
	return env || header || bearer || '';
}

export const POST: APIRoute = async ({ request }) => {
	const token = resolveToken(request);
	if (!token) {
		return new Response(JSON.stringify({ error: { message: '未授權：請設定 SANITY_API_TOKEN（伺服器）或後台 x-admin-token' } }), {
			status: 401,
			headers: { 'Content-Type': 'application/json; charset=utf-8' }
		});
	}

	let payload: { path?: string; method?: string; body?: string | null };
	try {
		payload = await request.json();
	} catch {
		return new Response(JSON.stringify({ error: { message: '無效的 JSON 本文' } }), {
			status: 400,
			headers: { 'Content-Type': 'application/json; charset=utf-8' }
		});
	}

	const path = String(payload.path ?? '').trim();
	const method = String(payload.method ?? 'GET').trim();
	if (!path.startsWith('/api/')) {
		return new Response(JSON.stringify({ error: { message: 'path 必須以 /api/ 開頭' } }), {
			status: 400,
			headers: { 'Content-Type': 'application/json; charset=utf-8' }
		});
	}

	const rawBody =
		typeof payload.body === 'string' ? payload.body : payload.body != null ? JSON.stringify(payload.body) : null;

	const result = await runSanityDashboardRequest({ path, method, rawBody, token });
	return new Response(JSON.stringify(result.body), {
		status: result.status,
		headers: { 'Content-Type': 'application/json; charset=utf-8' }
	});
};
