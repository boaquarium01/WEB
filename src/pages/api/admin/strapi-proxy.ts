import type { APIRoute } from 'astro';
import { readStrapiAdminBaseUrl, readStrapiApiToken } from '../../../lib/strapi/env';

function buildTargetUrl(request: Request): string {
  const url = new URL(request.url);
  const path = url.searchParams.get('path') ?? '';
  if (!path.startsWith('/api/')) throw new Error('Invalid path');
  const base = readStrapiAdminBaseUrl() || 'http://localhost:1337';
  return `${base}${path}`;
}

async function proxy(request: Request): Promise<Response> {
  try {
    const targetUrl = buildTargetUrl(request);
    const token = readStrapiApiToken();
    const method = request.method.toUpperCase();
    const headers = new Headers();
    if (token) headers.set('Authorization', `Bearer ${token}`);

    let body: BodyInit | undefined;
    const contentType = request.headers.get('content-type') ?? '';
    if (method !== 'GET' && method !== 'HEAD') {
      if (contentType.includes('multipart/form-data')) {
        body = await request.formData();
      } else if (contentType.includes('application/json')) {
        headers.set('Content-Type', 'application/json');
        body = await request.text();
      } else {
        body = await request.arrayBuffer();
      }
    }

    const res = await fetch(targetUrl, { method, headers, body });
    const outType = res.headers.get('content-type') ?? '';
    if (outType.includes('application/json')) {
      const json = await res.json();
      return new Response(JSON.stringify(json), {
        status: res.status,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    }

    return new Response(await res.text(), { status: res.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Proxy error';
    return new Response(JSON.stringify({ error: { message } }), {
      status: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }
}

export const GET: APIRoute = async ({ request }) => proxy(request);
export const POST: APIRoute = async ({ request }) => proxy(request);
export const PUT: APIRoute = async ({ request }) => proxy(request);
export const PATCH: APIRoute = async ({ request }) => proxy(request);
export const DELETE: APIRoute = async ({ request }) => proxy(request);
