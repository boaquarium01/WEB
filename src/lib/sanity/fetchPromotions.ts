import { createClient, type SanityClient } from '@sanity/client';
import type { SanityImageSource } from '@sanity/image-url/lib/types/types';
import type { Promotion } from '../../data/promotion';
import { portableBlocksToPlainText } from '../portableText';
import { strapiBlocksToPlainText } from '../strapi/blocks';
import { dedupePromotionDocuments } from './dedupePromotions';
import { readSanityProjectDataset } from './env';

const API_VERSION = '2025-03-18';

const PROMO_TITLE_BY_SLUG: Record<string, string> = {
  'weekly-new': '每週新進魚隻🐠',
  'special-offers': '預定優惠',
  'equipment-sale': '器材促銷'
};

const PROMO_DOC_ID_BY_SLUG: Record<string, string> = {
  'weekly-new': 'promotion-weekly-new',
  'special-offers': 'promotion-special-offers',
  'equipment-sale': 'promotion-equipment-sale'
};

function readSanityEnv() {
  return readSanityProjectDataset();
}

function getClient(): SanityClient | null {
  const { projectId, dataset } = readSanityEnv();
  if (!projectId) return null;
  return createClient({
    projectId,
    dataset,
    useCdn: false,
    apiVersion: API_VERSION,
    timeout: 12_000,
    maxRetries: 1
  });
}

type SanityPromotionDoc = {
  _id?: string;
  title?: string;
  slug?: string;
  content?: unknown;
  promoImages?: unknown[] | null;
};

/** 與後台 `promotionContentToText` 對齊：純文字、Portable Text 或 Strapi blocks 皆轉成字串 */
function normalizePromotionContent(raw: unknown): string {
  if (raw == null) return '';
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) {
    const pt = portableBlocksToPlainText(raw);
    if (pt.trim()) return pt;
    return strapiBlocksToPlainText(raw);
  }
  return String(raw);
}

const PROMOTION_PROJECTION = `
  _id,
  title,
  "slug": slug.current,
  content,
  promoImages
`;

// Public site should not read drafts; drafts may be incomplete and can override published docs.
const ALL_PROMOTIONS_QUERY = `*[_type == "promotion" && defined(slug.current) && !(_id in path("drafts.**"))] | order(_updatedAt desc) {${PROMOTION_PROJECTION}}`;
const PROMOTION_BY_SLUG_QUERY = `*[_type == "promotion" && slug.current == $slug && !(_id in path("drafts.**"))][0] {${PROMOTION_PROJECTION}}`;

function mapToPromotion(doc: SanityPromotionDoc): Promotion | null {
  const slug = String(doc.slug ?? '').trim();
  let title = String(doc.title ?? '').trim() || PROMO_TITLE_BY_SLUG[slug] || '';
  if (slug === 'weekly-new') title = PROMO_TITLE_BY_SLUG['weekly-new'];
  if (!slug || !title) return null;

  const imgs: SanityImageSource[] = [];
  if (Array.isArray(doc.promoImages)) {
    for (const it of doc.promoImages) {
      if (it && typeof it === 'object') imgs.push(it as SanityImageSource);
    }
  }

  return {
    _id: doc._id ? String(doc._id) : undefined,
    title,
    slug,
    content: normalizePromotionContent(doc.content),
    promoImages: imgs.slice(0, 25)
  };
}

export async function getAllPromotions(): Promise<Promotion[]> {
  const client = getClient();
  if (!client) return [];
  let docs: SanityPromotionDoc[] = [];
  try {
    docs = (await client.fetch<SanityPromotionDoc[]>(ALL_PROMOTIONS_QUERY)) ?? [];
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[Sanity] 促銷分頁查詢失敗。', msg);
    return [];
  }
  const deduped = dedupePromotionDocuments(docs);
  return deduped.map(mapToPromotion).filter(Boolean) as Promotion[];
}

export async function getAllPromotionSlugs(): Promise<string[]> {
  return Object.keys(PROMO_DOC_ID_BY_SLUG);
}

async function getPromotionByDocId(client: SanityClient, docId: string): Promise<SanityPromotionDoc | null> {
  // Prefer published doc for public pages; only fall back to draft if published is missing.
  try {
    const published = await client.fetch<SanityPromotionDoc | null>(
      `*[_type == "promotion" && _id == $id][0] {${PROMOTION_PROJECTION}}`,
      { id: docId }
    );
    if (published) return published;
    return await client.fetch<SanityPromotionDoc | null>(
      `*[_type == "promotion" && _id == ('drafts.' + $id)][0] {${PROMOTION_PROJECTION}}`,
      { id: docId }
    );
  } catch {
    return null;
  }
}

export async function getPromotionBySlug(slug: string): Promise<Promotion | null> {
  const s = String(slug ?? '').trim();
  if (!s) return null;
  const client = getClient();
  if (!client) return null;
  let doc: SanityPromotionDoc | null = null;
  try {
    doc = await client.fetch<SanityPromotionDoc | null>(PROMOTION_BY_SLUG_QUERY, { slug: s });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[Sanity] 單筆促銷頁 API 無法連線。', msg);
    return null;
  }
  if (!doc && PROMO_DOC_ID_BY_SLUG[s]) {
    doc = await getPromotionByDocId(client, PROMO_DOC_ID_BY_SLUG[s]);
  }
  if (!doc) return null;
  if (!doc.slug) {
    doc.slug = s;
  }
  if (!doc.title && PROMO_TITLE_BY_SLUG[s]) {
    doc.title = PROMO_TITLE_BY_SLUG[s];
  }
  return mapToPromotion(doc);
}

