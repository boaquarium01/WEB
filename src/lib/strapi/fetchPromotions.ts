import type { Promotion } from '../../data/promotion';
import { readStrapiBaseUrl } from './env';
import { extractStrapiMediaItems, resolveMediaUrl } from './media';
import { unwrapStrapiEntry, unwrapStrapiList } from './rest';

const PROMO_TITLE_BY_SLUG: Record<string, string> = {
  'weekly-new': '每週新進魚隻🐠',
  'special-offers': '預定優惠',
  'equipment-sale': '器材促銷'
};

function mapRow(base: string, row: Record<string, unknown>): Promotion | null {
  const slug = String(row.slug ?? '').trim();
  let title = String(row.title ?? '').trim();
  if (!slug) return null;
  if (!title) title = PROMO_TITLE_BY_SLUG[slug] ?? '';
  if (!title) return null;

  const imgs: { url: string }[] = [];
  const items = extractStrapiMediaItems(row.promoImages);
  for (const item of items) {
    const u = resolveMediaUrl(base, unwrapStrapiEntry(item));
    if (u) imgs.push({ url: u });
  }

  return {
    _id: row.documentId != null ? String(row.documentId) : row.id != null ? String(row.id) : undefined,
    title,
    slug,
    content: String(row.content ?? ''),
    promoImages: imgs.slice(0, 25)
  };
}

export async function getAllPromotions(): Promise<Promotion[]> {
  const base = readStrapiBaseUrl();
  if (!base) return [];

  const sp = new URLSearchParams({ populate: '*', 'pagination[pageSize]': '100' });
  try {
    const res = await fetch(`${base}/api/promotions?${sp.toString()}`, {
      signal: AbortSignal.timeout(12_000)
    });
    if (!res.ok) throw new Error(String(res.status));
    const json = await res.json();
    const rows = unwrapStrapiList(json);
    return rows.map((r) => mapRow(base, r)).filter(Boolean) as Promotion[];
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[Strapi] 促銷分頁查詢失敗。', msg);
    return [];
  }
}

export async function getAllPromotionSlugs(): Promise<string[]> {
  const base = readStrapiBaseUrl();
  if (!base) return Object.keys(PROMO_TITLE_BY_SLUG);

  const sp = new URLSearchParams({ 'fields[0]': 'slug', 'pagination[pageSize]': '100' });
  try {
    const res = await fetch(`${base}/api/promotions?${sp.toString()}`, {
      signal: AbortSignal.timeout(12_000)
    });
    if (!res.ok) throw new Error(String(res.status));
    const json = await res.json();
    const rows = unwrapStrapiList(json);
    const fromApi = rows.map((r) => String(r.slug ?? '').trim()).filter(Boolean);
    if (fromApi.length > 0) return fromApi;
  } catch {
    /* fallthrough */
  }
  return Object.keys(PROMO_TITLE_BY_SLUG);
}

export async function getPromotionBySlug(slug: string): Promise<Promotion | null> {
  const s = String(slug ?? '').trim();
  if (!s) return null;

  const base = readStrapiBaseUrl();
  if (!base) return null;

  const sp = new URLSearchParams({
    'filters[slug][$eq]': s,
    populate: '*'
  });

  try {
    const res = await fetch(`${base}/api/promotions?${sp.toString()}`, {
      signal: AbortSignal.timeout(12_000)
    });
    if (!res.ok) throw new Error(String(res.status));
    const json = await res.json();
    const rows = unwrapStrapiList(json);
    const row = rows[0];
    if (!row) return null;
    return mapRow(base, row);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[Strapi] 單筆促銷頁 API 無法連線。', msg);
    return null;
  }
}
