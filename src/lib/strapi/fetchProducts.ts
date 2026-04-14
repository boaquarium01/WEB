import type { Category, Product } from '../../data/catalog';
import { PRODUCTS_PAGE_SIZE } from '../../data/catalog';
import { strapiBlocksToPlainText } from './blocks';
import { readStrapiBaseUrl } from './env';
import { extractStrapiMediaItems, resolveMediaUrl } from './media';
import { getStrapiMetaPageCount, unwrapRelationOne, unwrapStrapiEntry, unwrapStrapiList } from './rest';

const SORT_ORDER_DEFAULT_LAST = 36 ** 4 - 1;

let warnedMissingBase = false;

function warnMissingStrapiUrl() {
  if (warnedMissingBase) return;
  warnedMissingBase = true;
  console.warn(
    '[Strapi] 未設定 PUBLIC_STRAPI_URL，商品資料為空。範例：PUBLIC_STRAPI_URL=http://localhost:1337'
  );
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(12_000)
  });
  if (!res.ok) {
    throw new Error(`Strapi HTTP ${res.status} ${url}`);
  }
  return res.json();
}

async function fetchAllPages(
  base: string,
  apiPath: string,
  staticParams: Record<string, string>,
  pageSize = 100
): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  let page = 1;
  let pageCount = 1;
  do {
    const sp = new URLSearchParams({
      ...staticParams,
      'pagination[page]': String(page),
      'pagination[pageSize]': String(pageSize)
    });
    const json = await fetchJson(`${base}/api/${apiPath}?${sp.toString()}`);
    out.push(...unwrapStrapiList(json));
    pageCount = getStrapiMetaPageCount(json);
    page += 1;
  } while (page <= pageCount);
  return out;
}

function parseOptionalFiniteNumber(v: unknown): number | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v === 'string' && v.trim() === '') return undefined;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function normalizeSeoKeywords(raw: unknown): string[] | undefined {
  if (raw == null) return undefined;
  if (Array.isArray(raw)) {
    const xs = raw.map((x) => String(x).trim()).filter(Boolean);
    return xs.length ? xs : undefined;
  }
  if (typeof raw === 'string' && raw.trim()) {
    return raw
      .split(/[,，、]/g)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return undefined;
}

function collectProductImages(
  base: string,
  imageRaw: unknown,
  galleryRaw: unknown
): string[] {
  const urls: string[] = [];
  const tryPush = (u: string | null) => {
    if (u && !urls.includes(u)) urls.push(u);
  };
  tryPush(resolveMediaUrl(base, imageRaw));

  const items = extractStrapiMediaItems(galleryRaw);
  for (const item of items) {
    tryPush(resolveMediaUrl(base, unwrapStrapiEntry(item)));
  }
  return urls;
}

function mapRowToProduct(base: string, row: Record<string, unknown>): Product | null {
  const slug = String(row.slug ?? '').trim();
  if (!slug) return null;

  const cat = unwrapRelationOne(row.category);
  const categorySlug = String(cat?.slug ?? '').trim() || 'uncategorized';
  const categoryLabel = String(cat?.name ?? '').trim() || '未分類';

  const images = collectProductImages(base, row.image, row.gallery);
  const excerptRaw = String(row.excerpt ?? '').trim();
  const body = Array.isArray(row.body) && row.body.length > 0 ? (row.body as unknown[]) : null;
  const fromBody = strapiBlocksToPlainText(body);
  const excerpt =
    excerptRaw ||
    (fromBody ? (fromBody.length > 140 ? `${fromBody.slice(0, 140).trim()}...` : fromBody) : '');

  const st = row.seoTitle != null ? String(row.seoTitle).trim() : '';
  const sd = row.seoDescription != null ? String(row.seoDescription).trim() : '';

  const docId =
    row.documentId != null
      ? String(row.documentId)
      : row.id != null
        ? String(row.id)
        : undefined;

  return {
    _id: docId,
    slug,
    name: String(row.name ?? '未命名').trim() || '未命名',
    category: categorySlug,
    categoryLabel,
    enabled: row.enabled !== false,
    sortOrder: Number.isFinite(Number(row.sortOrder)) ? Number(row.sortOrder) : SORT_ORDER_DEFAULT_LAST,
    image: images[0] ?? '',
    images,
    excerpt,
    body,
    featured: Boolean(row.featured),
    featuredSortOrder: parseOptionalFiniteNumber(row.featuredSortOrder),
    heroSpotlight: Boolean(row.heroSpotlight),
    heroSpotlightActivatedAt:
      row.heroSpotlightActivatedAt != null && String(row.heroSpotlightActivatedAt).trim() !== ''
        ? String(row.heroSpotlightActivatedAt)
        : undefined,
    seoKeywords: normalizeSeoKeywords(row.seoKeywords),
    seoTitle: st || undefined,
    seoDescription: sd || undefined
  };
}

let cache: { at: number; data: Product[] } | null = null;
let categoryCache: { at: number; data: Category[] } | null = null;
let featuredCache: { at: number; limit: number; data: Product[] } | null = null;
let heroSpotlightCache: { at: number; data: Product[] } | null = null;

export async function getAllCategories(): Promise<Category[]> {
  const ttlMs = import.meta.env.DEV ? 0 : 60_000;
  if (categoryCache && ttlMs > 0 && Date.now() - categoryCache.at < ttlMs) return categoryCache.data;
  categoryCache = null;

  const base = readStrapiBaseUrl();
  if (!base) {
    warnMissingStrapiUrl();
    categoryCache = { at: Date.now(), data: [] };
    return [];
  }

  let rows: Record<string, unknown>[] = [];
  try {
    rows = await fetchAllPages(base, 'categories', { populate: '*' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[Strapi] 分類 API 無法連線，先顯示空清單。', msg);
    categoryCache = null;
    return [];
  }

  rows.sort((a, b) => {
    const oa = String(a.orderRank ?? '');
    const ob = String(b.orderRank ?? '');
    if (oa !== ob) return oa < ob ? -1 : oa > ob ? 1 : 0;
    const la = Number.isFinite(Number(a.legacySortOrder)) ? Number(a.legacySortOrder) : 100;
    const lb = Number.isFinite(Number(b.legacySortOrder)) ? Number(b.legacySortOrder) : 100;
    if (la !== lb) return la - lb;
    return String(a.name ?? '').localeCompare(String(b.name ?? ''), 'zh-Hant');
  });

  const categories: Category[] = rows
    .map((r) => ({
      id: String(r.slug ?? '').trim(),
      label: String(r.name ?? '').trim()
    }))
    .filter((c) => c.id && c.label)
    .map((c, i) => ({ ...c, sortOrder: i }));

  categoryCache = { at: Date.now(), data: categories };
  return categories;
}

export async function getAllProducts(): Promise<Product[]> {
  const ttlMs = import.meta.env.DEV ? 0 : 60_000;
  if (cache && ttlMs > 0 && Date.now() - cache.at < ttlMs) return cache.data;
  cache = null;

  const base = readStrapiBaseUrl();
  if (!base) {
    warnMissingStrapiUrl();
    cache = { at: Date.now(), data: [] };
    return [];
  }

  let rows: Record<string, unknown>[] = [];
  try {
    rows = await fetchAllPages(base, 'products', { populate: '*' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[Strapi] 商品列表 API 無法連線，先顯示空清單。', msg);
    cache = null;
    return [];
  }

  const mapped = rows
    .map((r) => mapRowToProduct(base, r))
    .filter((p): p is Product => Boolean(p) && p.slug.length > 0 && p.enabled);

  cache = { at: Date.now(), data: mapped };
  return mapped;
}

export async function getHeroSpotlightProducts(): Promise<Product[]> {
  const ttlMs = import.meta.env.DEV ? 0 : 60_000;
  if (heroSpotlightCache && ttlMs > 0 && Date.now() - heroSpotlightCache.at < ttlMs) {
    return heroSpotlightCache.data;
  }
  heroSpotlightCache = null;

  const base = readStrapiBaseUrl();
  if (!base) {
    warnMissingStrapiUrl();
    return [];
  }

  let rows: Record<string, unknown>[] = [];
  try {
    rows = await fetchAllPages(base, 'products', {
      'filters[heroSpotlight][$eq]': 'true',
      populate: '*'
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[Strapi] 主打商品查詢失敗。', msg);
    return [];
  }

  const mapped = rows
    .map((r) => mapRowToProduct(base, r))
    .filter((p): p is Product => Boolean(p) && p.slug.length > 0 && p.enabled)
    .sort((a, b) => {
      const ta = Date.parse(a.heroSpotlightActivatedAt ?? '') || 0;
      const tb = Date.parse(b.heroSpotlightActivatedAt ?? '') || 0;
      return tb - ta;
    })
    .slice(0, 3);

  heroSpotlightCache = { at: Date.now(), data: mapped };
  return mapped;
}

export async function getFeaturedProducts(limit = 6): Promise<Product[]> {
  const ttlMs = import.meta.env.DEV ? 0 : 60_000;
  const cap = Math.max(0, Math.floor(Number(limit)) || 0);
  if (cap === 0) return [];

  if (
    featuredCache &&
    ttlMs > 0 &&
    featuredCache.limit === cap &&
    Date.now() - featuredCache.at < ttlMs
  ) {
    return featuredCache.data;
  }
  featuredCache = null;

  const base = readStrapiBaseUrl();
  if (!base) {
    warnMissingStrapiUrl();
    return [];
  }

  let rows: Record<string, unknown>[] = [];
  try {
    rows = await fetchAllPages(base, 'products', {
      'filters[featured][$eq]': 'true',
      populate: '*'
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[Strapi] 首頁熱銷查詢失敗，改為自全列表篩選。', msg);
    const all = await getAllProducts();
    return sortFeatured(all).slice(0, cap);
  }

  const mapped = sortFeatured(
    rows
      .map((r) => mapRowToProduct(base, r))
      .filter((p): p is Product => Boolean(p) && p.slug.length > 0 && p.enabled)
  ).slice(0, cap);

  featuredCache = { at: Date.now(), limit: cap, data: mapped };
  return mapped;
}

function sortFeatured(list: Product[]): Product[] {
  return [...list].sort((a, b) => {
    const aHas = typeof a.featuredSortOrder === 'number' && Number.isFinite(a.featuredSortOrder);
    const bHas = typeof b.featuredSortOrder === 'number' && Number.isFinite(b.featuredSortOrder);
    if (aHas !== bHas) return aHas ? -1 : 1;
    if (aHas && bHas) {
      const d = a.featuredSortOrder! - b.featuredSortOrder!;
      if (d !== 0) return d;
      return a.name.localeCompare(b.name, 'zh-Hant');
    }
    const d = a.sortOrder - b.sortOrder;
    if (d !== 0) return d;
    return a.name.localeCompare(b.name, 'zh-Hant');
  });
}

export async function getProductsByCategory(categoryId: string): Promise<Product[]> {
  return (await getAllProducts())
    .filter((p) => p.category === categoryId)
    .sort((a, b) => {
      const d = a.sortOrder - b.sortOrder;
      if (d !== 0) return d;
      return a.name.localeCompare(b.name, 'zh-Hant');
    });
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  const s = String(slug ?? '').trim();
  if (!s) return null;

  const base = readStrapiBaseUrl();
  if (!base) {
    warnMissingStrapiUrl();
    return null;
  }

  const sp = new URLSearchParams({
    'filters[slug][$eq]': s,
    populate: '*'
  });

  let json: unknown;
  try {
    json = await fetchJson(`${base}/api/products?${sp.toString()}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[Strapi] 單筆商品 API 無法連線。', msg);
    return null;
  }

  const list = unwrapStrapiList(json);
  const row = list[0];
  if (!row) return null;
  return mapRowToProduct(base, row);
}

export async function getProductsSortedForCatalog(): Promise<Product[]> {
  const [all, categories] = await Promise.all([getAllProducts(), getAllCategories()]);
  const orderMap = new Map<string, number>();
  for (const c of categories) orderMap.set(c.id, c.sortOrder);

  return [...all].sort((a, b) => {
    const ca = orderMap.get(a.category) ?? 999;
    const cb = orderMap.get(b.category) ?? 999;
    if (ca !== cb) return ca - cb;

    const d = a.sortOrder - b.sortOrder;
    if (d !== 0) return d;
    return a.name.localeCompare(b.name, 'zh-Hant');
  });
}

export function getCatalogPageCount(itemCount: number, pageSize = PRODUCTS_PAGE_SIZE): number {
  if (itemCount <= 0) return 1;
  return Math.ceil(itemCount / pageSize);
}

export async function getAllProductSlugs(): Promise<string[]> {
  const base = readStrapiBaseUrl();
  if (!base) return [];

  const sp = new URLSearchParams({
    'fields[0]': 'slug',
    'pagination[pageSize]': '500'
  });

  try {
    const json = await fetchJson(`${base}/api/products?${sp.toString()}`);
    const rows = unwrapStrapiList(json);
    return rows.map((r) => String(r.slug ?? '').trim()).filter(Boolean);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[Strapi] 無法取得商品 slug 列表（靜態路徑）。', msg);
    return [];
  }
}
