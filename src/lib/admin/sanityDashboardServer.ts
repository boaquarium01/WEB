/**
 * 自製後台：Sanity 讀寫（GROQ + transaction），取代 Strapi REST。
 * 需伺服器環境變數 SANITY_API_TOKEN（具 Editor 權限），或由請求 x-admin-token 傳入。
 */
import { createClient, type SanityClient } from '@sanity/client';
import imageUrlBuilder from '@sanity/image-url';
import type { ImageUrlBuilder } from '@sanity/image-url/lib/types/builder';
import { plainTextToPortableBlocks } from '../portableText';
import { strapiBlocksToPlainText } from '../strapi/blocks';
import { dedupePromotionDocuments } from '../sanity/dedupePromotions';

const API_VERSION = '2025-03-18';

/** 與 `src/lib/sanity/fetchProducts.ts` 一致：Vite 會內嵌 `import.meta.env.PUBLIC_*`，dev 時 `process.env` 未必有值 */
const DEFAULT_PROJECT_ID = 'iz7fvprm';
const DEFAULT_DATASET = 'production';

export function readEnv(): { projectId: string; dataset: string } {
	let fromMetaProject = '';
	let fromMetaDataset = '';
	try {
		fromMetaProject =
			String(import.meta.env?.PUBLIC_SANITY_PROJECT_ID ?? '').trim() ||
			String(import.meta.env?.SANITY_STUDIO_PROJECT_ID ?? '').trim();
		fromMetaDataset =
			String(import.meta.env?.PUBLIC_SANITY_DATASET ?? '').trim() ||
			String(import.meta.env?.SANITY_STUDIO_DATASET ?? '').trim();
	} catch {
		/* non-Vite */
	}
	const projectId =
		fromMetaProject ||
		(typeof process !== 'undefined' && process.env?.PUBLIC_SANITY_PROJECT_ID?.trim()) ||
		(typeof process !== 'undefined' && process.env?.SANITY_STUDIO_PROJECT_ID?.trim()) ||
		DEFAULT_PROJECT_ID;
	const dataset =
		fromMetaDataset ||
		(typeof process !== 'undefined' && process.env?.PUBLIC_SANITY_DATASET?.trim()) ||
		(typeof process !== 'undefined' && process.env?.SANITY_STUDIO_DATASET?.trim()) ||
		DEFAULT_DATASET;
	return { projectId, dataset };
}

/** 與 `sanityWriteClient` 一致：伺服器 env 優先，其次 import.meta（本機／特殊整合） */
export function readSanityWriteToken(): string {
	const fromProcess = () => {
		if (typeof process === 'undefined' || !process.env) return '';
		const keys = [
			'SANITY_API_TOKEN',
			'PUBLIC_SANITY_API_TOKEN',
			'SANITY_STUDIO_TOKEN',
			'SANITY_AUTH_TOKEN',
			'SANITY_WRITE_TOKEN'
		] as const;
		for (const k of keys) {
			const v = process.env[k]?.trim();
			if (v) return v;
		}
		return '';
	};
	let meta = '';
	try {
		meta =
			String(import.meta.env?.SANITY_API_TOKEN ?? '').trim() ||
			String(import.meta.env?.SANITY_STUDIO_TOKEN ?? '').trim() ||
			String(import.meta.env?.SANITY_AUTH_TOKEN ?? '').trim() ||
			String(import.meta.env?.SANITY_WRITE_TOKEN ?? '').trim();
	} catch {
		meta = '';
	}
	return (fromProcess() || meta || '').trim();
}

function getWriteClient(token: string): SanityClient | null {
	const { projectId, dataset } = readEnv();
	if (!projectId || !token) return null;
	return createClient({
		projectId,
		dataset,
		apiVersion: API_VERSION,
		useCdn: false,
		token,
	});
}

/** 列表 GET：公開 dataset 可不帶 token；寫入仍須 token */
function getClientForDashboard(token: string, method: string): SanityClient | null {
	const { projectId, dataset } = readEnv();
	if (!projectId) return null;
	const m = method.toUpperCase();
	const t = token.trim();
	if (t) {
		return createClient({ projectId, dataset, apiVersion: API_VERSION, useCdn: false, token: t });
	}
	if (m === 'GET') {
		return createClient({ projectId, dataset, apiVersion: API_VERSION, useCdn: true });
	}
	return null;
}

function thumbFromSanityImage(img: unknown, b: ImageUrlBuilder): { id: string; url: string } | null {
	if (!img || typeof img !== 'object') return null;
	const o = img as { asset?: { _ref?: string } };
	const ref = o.asset?._ref ?? '';
	const url = ref ? b.image(img as Parameters<ImageUrlBuilder['image']>[0]).width(720).url() : '';
	if (!url) return null;
	return { id: ref || url, url };
}

function mapProductRow(doc: Record<string, unknown>, b: ImageUrlBuilder) {
	const cat = doc.category as Record<string, unknown> | null | undefined;
	const catId = cat && typeof cat === 'object' ? String((cat as { _id?: string })._id ?? '') : '';
	const img = thumbFromSanityImage(doc.image, b);
	const gallery = Array.isArray(doc.gallery)
		? (doc.gallery as unknown[]).map((g) => thumbFromSanityImage(g, b)).filter(Boolean)
		: [];
	const mergedForList = [];
	if (img) mergedForList.push(img);
	for (const x of gallery) {
		if (x) mergedForList.push(x);
	}
	return {
		...doc,
		id: doc._id,
		documentId: doc._id,
		slug: (doc.slug as { current?: string })?.current ?? doc.slug,
		name: doc.name,
		excerpt: doc.excerpt,
		body: doc.body,
		enabled: doc.enabled,
		sortOrder: doc.sortOrder,
		featured: doc.featured,
		featuredSortOrder: doc.featuredSortOrder,
		heroSpotlight: doc.heroSpotlight,
		heroSpotlightActivatedAt: doc.heroSpotlightActivatedAt,
		seoTitle: doc.seoTitle,
		seoKeywords: doc.seoKeywords,
		seoDescription: doc.seoDescription,
		image: img,
		gallery: gallery.length ? gallery : undefined,
		_listThumbs: mergedForList,
		category: catId
			? {
					id: catId,
					documentId: catId,
					name: (cat as { name?: string }).name,
					data: {
						id: catId,
						attributes: { name: (cat as { name?: string }).name }
					}
				}
			: null
	};
}

const PRODUCT_FETCH = `*[_type == "product" && defined(slug.current)] | order(name asc) {
  _id,
  name,
  slug,
  excerpt,
  body,
  enabled,
  sortOrder,
  featured,
  featuredSortOrder,
  heroSpotlight,
  heroSpotlightActivatedAt,
  seoTitle,
  seoKeywords,
  seoDescription,
  image,
  gallery,
  "category": category->{ _id, name, "slug": slug.current }
}`;

const PROMOTION_FETCH = `*[_type == "promotion" && defined(slug.current)] | order(_updatedAt desc) {
  _id, title, slug, content, promoImages
}`;

const CATEGORY_FETCH = `*[_type == "category"] | order(orderRank asc, name asc) {
  _id, name, slug, orderRank, sortOrder
}`;

function mapPromotionRow(doc: Record<string, unknown>, b: ImageUrlBuilder) {
	const imgs: unknown[] = Array.isArray(doc.promoImages) ? doc.promoImages : [];
	const mapped = imgs
		.map((im) => thumbFromSanityImage(im, b))
		.filter((x): x is { id: string; url: string } => Boolean(x));
	return {
		...doc,
		id: doc._id,
		documentId: doc._id,
		title: doc.title,
		slug: (doc.slug as { current?: string })?.current ?? doc.slug,
		content: doc.content,
		promoImages: mapped.map((m) => ({
			id: m.id,
			url: m.url,
			attributes: { url: m.url.replace(/^https?:\/\/[^/]+/, '') }
		}))
	};
}

function mapCategoryRow(doc: Record<string, unknown>) {
	const slug = (doc.slug as { current?: string })?.current ?? '';
	return {
		...doc,
		id: doc._id,
		documentId: doc._id,
		name: doc.name,
		slug,
		orderRank: doc.orderRank != null ? String(doc.orderRank) : ''
	};
}

function bodyToPortable(input: unknown): unknown[] {
	if (Array.isArray(input) && input.length) {
		const first = input[0] as { _type?: string; type?: string };
		if (first && first._type === 'block') return input as unknown[];
		if (first && first.type === 'paragraph') {
			const t = strapiBlocksToPlainText(input as unknown[]);
			return plainTextToPortableBlocks(t);
		}
	}
	if (typeof input === 'string') return plainTextToPortableBlocks(input);
	return plainTextToPortableBlocks('');
}

function refImageFromId(id: string | number | null | undefined) {
	if (id == null || id === '') return undefined;
	const s = typeof id === 'number' ? String(id) : String(id).trim();
	if (!s.startsWith('image-')) return undefined;
	return { _type: 'image' as const, asset: { _type: 'reference' as const, _ref: s } };
}

type ImageRefBlock = {
	_type: 'image';
	_key: string;
	asset: { _type: 'reference'; _ref: string };
};

/** collect()：純 id[]（數字或 image-*）或 Strapi 的 `{ id }[]`；陣列項必含 `_key` 才能在 Studio 編輯／拖曳 */
function mixedImageRefs(input: unknown): ImageRefBlock[] {
	if (!Array.isArray(input)) return [];
	const out: ImageRefBlock[] = [];
	for (let i = 0; i < input.length; i++) {
		const x = input[i];
		const raw =
			typeof x === 'object' && x != null && 'id' in x
				? String((x as { id?: string | number }).id ?? '')
				: String(x ?? '');
		const ref = refImageFromId(raw);
		if (ref) {
			const aid = ref.asset._ref;
			const suffix = aid.replace(/^image-/, '').slice(0, 32) || String(i);
			out.push({ ...ref, _key: `img_${i}_${suffix}` });
		}
	}
	return out;
}

function promotionContentToText(data: Record<string, unknown>): string | undefined {
	const c = data.content;
	if (c == null) return undefined;
	if (typeof c === 'string') return c;
	if (Array.isArray(c)) return strapiBlocksToPlainText(c as unknown[]);
	return String(c);
}

export async function runSanityDashboardRequest(opts: {
	path: string;
	method: string;
	rawBody: string | null;
	token: string;
}): Promise<{ status: number; body: unknown }> {
	const client = getClientForDashboard(opts.token, opts.method);
	if (!client) {
		return {
			status: 500,
			body: {
				error: {
					message:
						opts.method.toUpperCase() === 'GET'
							? 'Sanity 未設定：缺少 PUBLIC_SANITY_PROJECT_ID（或無法讀取 import.meta.env）'
							: 'Sanity 未設定：寫入需要 SANITY_STUDIO_TOKEN／SANITY_API_TOKEN 等，或於後台帶入 x-admin-token'
				}
			}
		};
	}

	const { projectId, dataset } = readEnv();
	const b = imageUrlBuilder({ projectId, dataset });

	const url = new URL(opts.path, 'http://x');
	const pathname = url.pathname;
	const method = opts.method.toUpperCase();

	const parseJson = () => {
		try {
			return opts.rawBody ? JSON.parse(opts.rawBody) : {};
		} catch {
			return {};
		}
	};

	try {
	// —— 列表（對應 GET /api/xxx?populate=*）——
	if (method === 'GET') {
		if (pathname.startsWith('/api/promotions')) {
			const docsRaw = await client.fetch(PROMOTION_FETCH);
			const docs = dedupePromotionDocuments((docsRaw ?? []) as Record<string, unknown>[]);
			const rows = docs.map((d) => mapPromotionRow(d, b));
			return { status: 200, body: { data: rows } };
		}
		if (pathname.startsWith('/api/products')) {
			const docs = await client.fetch(PRODUCT_FETCH);
			const rows = (docs as Record<string, unknown>[]).map((d) => mapProductRow(d, b));
			return { status: 200, body: { data: rows } };
		}
		if (pathname.startsWith('/api/categories')) {
			const docs = await client.fetch(CATEGORY_FETCH);
			const rows = (docs as Record<string, unknown>[]).map(mapCategoryRow);
			return { status: 200, body: { data: rows } };
		}
	}

	/** 分類內商品排序：單次 transaction 寫入多筆 sortOrder（須早於 /api/products/:id 路由，否則會被誤判為 id） */
	if (pathname === '/api/products/batch-sort-order' && method === 'POST') {
		const payload = parseJson();
		const data = (payload as { data?: { items?: unknown } }).data ?? {};
		const rawList = Array.isArray(data.items) ? data.items : [];
		const patches: { id: string; sortOrder: number }[] = [];
		for (const raw of rawList) {
			if (!raw || typeof raw !== 'object') continue;
			const o = raw as { id?: unknown; sortOrder?: unknown };
			const id = String(o.id ?? '').trim();
			const sortOrder = Number(o.sortOrder);
			if (!id || !Number.isFinite(sortOrder)) continue;
			patches.push({ id, sortOrder });
		}
		if (!patches.length) {
			return { status: 400, body: { error: { message: '缺少 items（需含 id 與 sortOrder）' } } };
		}
		let tx = client.transaction();
		for (const p of patches) {
			tx = tx.patch(p.id, (patch) => patch.set({ sortOrder: p.sortOrder }));
		}
		await tx.commit();
		return { status: 200, body: { data: { ok: true, updated: patches.length } } };
	}

	const idMatch = pathname.match(/^\/api\/(promotions|products|categories)\/([^/?]+)$/);
	if (idMatch && method === 'DELETE') {
		const id = decodeURIComponent(idMatch[2]);
		await client.delete(id);
		return { status: 200, body: { data: { id } } };
	}

	if (idMatch && method === 'PUT') {
		const model = idMatch[1];
		const id = decodeURIComponent(idMatch[2]);
		const payload = parseJson();
		const data = (payload as { data?: Record<string, unknown> }).data ?? {};

		if (model === 'promotions') {
			const patch: Record<string, unknown> = {};
			if (data.title != null) patch.title = data.title;
			if (data.content != null) patch.content = promotionContentToText(data);
			if (Array.isArray(data.promoImages)) {
				patch.promoImages = mixedImageRefs(data.promoImages);
			}
			await client.patch(id).set(patch).commit();
			const doc = await client.fetch(`*[_id == $id][0]{ _id, title, slug, content, promoImages}`, { id });
			return { status: 200, body: { data: mapPromotionRow(doc as Record<string, unknown>, b) } };
		}

		if (model === 'categories') {
			const patch: Record<string, unknown> = {};
			if (data.name != null) patch.name = data.name;
			if (data.slug != null) patch.slug = { _type: 'slug', current: String(data.slug) };
			if (data.orderRank != null) patch.orderRank = data.orderRank;
			await client.patch(id).set(patch).commit();
			const doc = await client.fetch(`*[_id == $id][0]{ _id, name, slug, orderRank, sortOrder}`, { id });
			return { status: 200, body: { data: mapCategoryRow(doc as Record<string, unknown>) } };
		}

		if (model === 'products') {
			const patch: Record<string, unknown> = {};
			if (data.name != null) patch.name = data.name;
			if (data.excerpt != null) patch.excerpt = data.excerpt;
			if (data.body != null) patch.body = bodyToPortable(data.body);
			if (data.enabled != null) patch.enabled = data.enabled;
			if (data.sortOrder != null) patch.sortOrder = Number(data.sortOrder);
			if (data.featured != null) patch.featured = data.featured;
			if (data.featuredSortOrder != null) patch.featuredSortOrder = Number(data.featuredSortOrder);
			if (data.heroSpotlight != null) {
				patch.heroSpotlight = data.heroSpotlight;
				if (data.heroSpotlight === true) {
					patch.heroSpotlightActivatedAt = new Date().toISOString();
				}
			}
			if (data.seoTitle != null) patch.seoTitle = data.seoTitle;
			if (data.seoKeywords != null) patch.seoKeywords = data.seoKeywords;
			if (data.seoDescription != null) patch.seoDescription = data.seoDescription;
			const catRef = data.category as string | number | null | undefined;
			if (catRef != null && String(catRef).trim()) {
				patch.category = { _type: 'reference', _ref: String(catRef).trim() };
			}
			/** Sanity `image` 欄位不可為 JSON null（Studio 會報 Invalid property value）；清除時須 unset */
			const unsetPaths: string[] = [];
			if (Object.prototype.hasOwnProperty.call(data, 'image')) {
				const imgId = data.image as string | number | null | undefined;
				const main = imgId != null && String(imgId).trim() ? refImageFromId(imgId) : undefined;
				if (main) patch.image = main;
				else unsetPaths.push('image');
			}
			if (Object.prototype.hasOwnProperty.call(data, 'gallery')) {
				const galRaw = Array.isArray(data.gallery) ? data.gallery : [];
				patch.gallery = mixedImageRefs(galRaw);
			}
			if (data.slug != null) patch.slug = { _type: 'slug', current: String(data.slug) };

			if (Object.keys(patch).length || unsetPaths.length) {
				let mut = client.patch(id);
				if (Object.keys(patch).length) mut = mut.set(patch);
				if (unsetPaths.length) mut = mut.unset(unsetPaths);
				await mut.commit();
			}
			const doc = await client.fetch(
				`*[_id == $id][0]{ _id, name, slug, excerpt, body, enabled, sortOrder, featured, featuredSortOrder, heroSpotlight, heroSpotlightActivatedAt, seoTitle, seoKeywords, seoDescription, image, gallery, "category": category->{ _id, name, "slug": slug.current } }`,
				{ id }
			);
			return { status: 200, body: { data: mapProductRow(doc as Record<string, unknown>, b) } };
		}
	}

	if (pathname === '/api/products' && method === 'POST') {
		const payload = parseJson();
		const data = (payload as { data?: Record<string, unknown> }).data ?? {};
		const slug = String(data.slug ?? '').trim() || `p${Date.now().toString(36)}`;
		const catRef = data.category != null ? String(data.category).trim() : '';
		if (!catRef) return { status: 400, body: { error: { message: '缺少分類' } } };

		const doc: Record<string, unknown> = {
			_type: 'product',
			name: data.name ?? '未命名',
			slug: { _type: 'slug', current: slug },
			category: { _type: 'reference', _ref: catRef },
			excerpt: data.excerpt ?? '',
			body: bodyToPortable(data.body),
			enabled: data.enabled !== false,
			sortOrder: Number(data.sortOrder) || 1679615,
			featured: Boolean(data.featured),
			featuredSortOrder: data.featuredSortOrder != null ? Number(data.featuredSortOrder) : undefined,
			heroSpotlight: Boolean(data.heroSpotlight),
			seoTitle: data.seoTitle,
			seoKeywords: data.seoKeywords,
			seoDescription: data.seoDescription
		};
		const imgId = data.image as string | number | undefined;
		const galRaw = Array.isArray(data.gallery) ? data.gallery : [];
		if (imgId != null && String(imgId).trim()) doc.image = refImageFromId(imgId);
		if (galRaw.length) doc.gallery = mixedImageRefs(galRaw);

		const created = await client.create(doc);
		const row = await client.fetch(
			`*[_id == $id][0]{ _id, name, slug, excerpt, body, enabled, sortOrder, featured, featuredSortOrder, heroSpotlight, heroSpotlightActivatedAt, seoTitle, seoKeywords, seoDescription, image, gallery, "category": category->{ _id, name, "slug": slug.current } }`,
			{ id: created._id }
		);
		return { status: 201, body: { data: mapProductRow(row as Record<string, unknown>, b) } };
	}

	if (pathname === '/api/categories' && method === 'POST') {
		const payload = parseJson();
		const data = (payload as { data?: Record<string, unknown> }).data ?? {};
		const name = String(data.name ?? '').trim();
		const slug = String(data.slug ?? '').trim();
		if (!name) return { status: 400, body: { error: { message: '缺少名稱' } } };
		const orderRank = data.orderRank != null ? String(data.orderRank) : String(Date.now());
		const doc = await client.create({
			_type: 'category',
			name,
			slug: { _type: 'slug', current: slug || name.toLowerCase().replace(/\s+/g, '-') },
			orderRank
		});
		const row = await client.fetch(`*[_id == $id][0]{ _id, name, slug, orderRank, sortOrder}`, { id: doc._id });
		return { status: 201, body: { data: mapCategoryRow(row as Record<string, unknown>) } };
	}

	return { status: 404, body: { error: { message: `不支援：${method} ${pathname}` } } };
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		console.error('[sanity-dashboard]', msg);
		return { status: 500, body: { error: { message: msg } } };
	}
}
