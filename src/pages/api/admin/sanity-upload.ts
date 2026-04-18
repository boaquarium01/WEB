import type { APIRoute } from 'astro';
import { createClient } from '@sanity/client';
import imageUrlBuilder from '@sanity/image-url';
import { readEnv, readSanityWriteToken } from '../../../lib/admin/sanityDashboardServer';

const API_VERSION = '2025-03-18';

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
		return new Response(JSON.stringify({ error: { message: '未授權：請設定 SANITY_API_TOKEN 或後台 x-admin-token' } }), {
			status: 401,
			headers: { 'Content-Type': 'application/json; charset=utf-8' }
		});
	}

	const { projectId, dataset } = readEnv();
	if (!projectId) {
		return new Response(JSON.stringify({ error: { message: '缺少 PUBLIC_SANITY_PROJECT_ID' } }), {
			status: 500,
			headers: { 'Content-Type': 'application/json; charset=utf-8' }
		});
	}

	const client = createClient({
		projectId,
		dataset,
		apiVersion: API_VERSION,
		useCdn: false,
		token
	});

	const b = imageUrlBuilder({ projectId, dataset });

	let formData: FormData;
	try {
		formData = await request.formData();
	} catch {
		return new Response(JSON.stringify({ error: { message: '無效的 multipart 本文' } }), {
			status: 400,
			headers: { 'Content-Type': 'application/json; charset=utf-8' }
		});
	}

	const entries = formData.getAll('files');
	const out: Array<{ id: string; url: string }> = [];

	for (const entry of entries) {
		if (!(entry instanceof File) || entry.size === 0) continue;
		const buffer = Buffer.from(await entry.arrayBuffer());
		const asset = await client.assets.upload('image', buffer, {
			filename: entry.name || 'upload.jpg'
		});
		const url = b.image({ _type: 'reference', _ref: asset._id }).width(720).url();
		out.push({ id: asset._id, url });
	}

	if (!out.length) {
		return new Response(JSON.stringify({ error: { message: '沒有有效的圖片檔' } }), {
			status: 400,
			headers: { 'Content-Type': 'application/json; charset=utf-8' }
		});
	}

	return new Response(JSON.stringify(out), {
		status: 200,
		headers: { 'Content-Type': 'application/json; charset=utf-8' }
	});
};
