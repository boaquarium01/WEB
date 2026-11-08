import type { APIContext } from 'astro';

export function jsonError(message: string, status = 400): Response {
	return new Response(JSON.stringify({ ok: false, error: message }), {
		status,
		headers: { 'Content-Type': 'application/json; charset=utf-8' },
	});
}

export function jsonOk(data: unknown, status = 200): Response {
	return new Response(JSON.stringify({ ok: true, data }), {
		status,
		headers: { 'Content-Type': 'application/json; charset=utf-8' },
	});
}

export function requireUser(context: APIContext) {
	if (!context.locals.user) {
		return null;
	}
	return context.locals.user;
}

/** Require a browser mutation to originate from the same V2 origin. */
export function hasSameOrigin(request: Request, origin: string): boolean {
	return request.headers.get('origin') === origin;
}

/** 把請求轉給 Better Auth 的 HTTP 入口（server 端直接呼叫 api.* 不會套用 rateLimit） */
export function authRequest(context: APIContext, path: string, body: unknown): Request {
	const headers = new Headers(context.request.headers);
	headers.set('content-type', 'application/json');
	headers.set('origin', context.url.origin);
	headers.delete('content-length');
	return new Request(new URL(`/api/auth${path}`, context.url.origin), { method: 'POST', headers, body: JSON.stringify(body) });
}
