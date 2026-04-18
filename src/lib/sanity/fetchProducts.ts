import { createClient, type SanityClient } from '@sanity/client';
import imageUrlBuilder from '@sanity/image-url';
import type { Category, Product } from '../../data/catalog';
import { PRODUCTS_PAGE_SIZE } from '../../data/catalog';
import { portableBlocksToPlainText } from '../portableText';
import { readSanityProjectDataset } from './env';

const API_VERSION = '2025-03-18';

/** 記憶體快取 TTL（預設 0：後台／Studio 變更後列表與首頁立即反映，避免短暫不同步） */
const LIST_CACHE_TTL_MS = 0;

/** 與 Studio schema 欄位對應（列表／首頁熱銷／單筆詳情共用投影） */
const PRODUCT_PROJECTION = `
  _id,
  name,
  "slug": slug.current,
  "category": category->slug.current,
  "categoryLabel": category->name,
  enabled,
  sortOrder,
  image,
  gallery,
  excerpt,
  body,
  featured,
  featuredSortOrder,
  heroSpotlight,
  heroSpotlightActivatedAt,
  seoKeywords,
  seoTitle,
  seoDescription
`;

const PRODUCT_QUERY = `*[_type == "product" && defined(slug.current)] {${PRODUCT_PROJECTION}}`;

/**
 * 首頁熱銷：僅精選且上架；排序與 getFeaturedProducts 一致——
 * `defined(featuredSortOrder) desc` 讓「有填熱銷排序」在前，其餘在後；
 * 再以 coalesce(featuredSortOrder, sortOrder) 作同段內次序，最後 name。
 */
const FEATURED_PRODUCTS_QUERY = `*[_type == "product" && defined(slug.current) && featured == true && enabled != false] | order(defined(featuredSortOrder) desc, coalesce(featuredSortOrder, sortOrder) asc, name asc) {${PRODUCT_PROJECTION}}`;

/** 首頁主打：最多 3 筆；最近開啟（heroSpotlightActivatedAt 新→舊）為第一順位 */
const HERO_SPOTLIGHT_PRODUCTS_QUERY = `*[_type == "product" && defined(slug.current) && heroSpotlight == true && enabled != false] | order(coalesce(heroSpotlightActivatedAt, _updatedAt) desc) [0...3] {${PRODUCT_PROJECTION}}`;
/** 分類順序：與 Studio「商品分類（拖曳排序）」一致；無 orderRank 時退回 sortOrder、名稱 */
const CATEGORY_QUERY = `*[_type == "category"] | order(orderRank asc, sortOrder asc, name asc) {
  "id": slug.current,
  "label": name
}`;

function readSanityEnv() {
  return readSanityProjectDataset();
}

function getClient(): SanityClient | null {
  const { projectId, dataset } = readSanityEnv();
  if (!projectId) {
    return null;
  }
  return createClient({
    projectId,
    dataset,
    useCdn: false,
    apiVersion: API_VERSION,
    /** 預設 5 分鐘過長；連線失敗時盡快走 catch 回退 */
    timeout: 12_000,
    maxRetries: 1
  });
}

let warnedMissingProjectId = false;

function warnMissingSanityConfig() {
  if (warnedMissingProjectId) return;
  warnedMissingProjectId = true;
  console.warn(
    '[Sanity] 未設定 PUBLIC_SANITY_PROJECT_ID，商品資料為空。請在 .env 或 Vercel Environment Variables 設定後重新建置。'
  );
}

/** 避免 Number(null)===0、Number('')===0 把「未填」當成有效排序數字 */
function parseOptionalFiniteNumber(v: unknown): number | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v === 'string' && v.trim() === '') return undefined;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

type SanityProductDoc = {
  _id?: string;
  slug?: string;
  name?: string;
  category?: string;
  categoryLabel?: string;
  enabled?: boolean;
  sortOrder?: number;
  image?: Record<string, unknown> | null;
  gallery?: (Record<string, unknown> | null)[] | null;
  excerpt?: string;
  body?: unknown[] | null;
  featured?: boolean;
  featuredSortOrder?: number;
  heroSpotlight?: boolean;
  heroSpotlightActivatedAt?: string;
  seoKeywords?: string[];
  seoTitle?: string;
  seoDescription?: string;
};

function urlFromSanityImage(
  ref: Record<string, unknown> | null | undefined,
  builder: ReturnType<typeof imageUrlBuilder>
): string | null {
  if (!ref) return null;
  try {
    return builder.image(ref).ignoreImageParams().width(1200).fit('max').auto('format').url();
  } catch {
    return null;
  }
}

/**
 * 主圖 + 相簿：只保留「能從 Sanity 解出網址」的項目，讓 urls 與 refs 索引對齊。
 * 若 image 僅有 _type/alt 而無 asset（如 Studio 殘留空欄位），會略過，避免詳情頁 SanityImage 拋錯。
 */
function collectMedia(
  doc: SanityProductDoc,
  builder: ReturnType<typeof imageUrlBuilder>
): { urls: string[]; refs: (Record<string, unknown> | null)[] } {
  type Pair = { url: string; ref: Record<string, unknown> };
  const pairs: Pair[] = [];

  const tryAdd = (ref: Record<string, unknown> | null | undefined) => {
    if (!ref) return;
    const url = urlFromSanityImage(ref, builder);
    if (url) pairs.push({ url, ref });
  };

  tryAdd(doc.image ?? undefined);
  if (Array.isArray(doc.gallery)) {
    for (const item of doc.gallery) {
      if (item && typeof item === 'object') tryAdd(item as Record<string, unknown>);
    }
  }

  const seen = new Set<string>();
  const urls: string[] = [];
  const refs: (Record<string, unknown> | null)[] = [];

  for (const { url, ref } of pairs) {
    if (!seen.has(url)) {
      seen.add(url);
      urls.push(url);
      refs.push(ref);
    }
  }

  return { urls, refs };
}

function mapToProduct(doc: SanityProductDoc, projectId: string, dataset: string): Product {
  const builder = imageUrlBuilder({ projectId, dataset });
  const { urls: images, refs: carouselRefs } = collectMedia(doc, builder);
  const hasSanityRef = carouselRefs.some((r) => r != null);
  const mainImageOk =
    doc.image && typeof doc.image === 'object'
      ? Boolean(urlFromSanityImage(doc.image as Record<string, unknown>, builder))
      : false;
  const imageRef =
    mainImageOk && doc.image && typeof doc.image === 'object'
      ? (doc.image as Record<string, unknown>)
      : null;

  const computeExcerpt = () => {
    const raw = String(doc.excerpt ?? '').trim();
    if (raw) return raw;
    const fromBody = portableBlocksToPlainText(doc.body as unknown[] | null);
    if (!fromBody) return '';
    return fromBody.length > 140 ? `${fromBody.slice(0, 140).trim()}...` : fromBody;
  };

  const st = doc.seoTitle != null ? String(doc.seoTitle).trim() : '';
  const sd = doc.seoDescription != null ? String(doc.seoDescription).trim() : '';

  return {
    _id: doc._id ? String(doc._id) : undefined,
    slug: String(doc.slug ?? '').trim(),
    name: String(doc.name ?? '未命名').trim() || '未命名',
    category: String(doc.category ?? '').trim() || 'uncategorized',
    categoryLabel: String(doc.categoryLabel ?? '').trim() || '未分類',
    enabled: doc.enabled !== false,
    sortOrder: Number.isFinite(Number(doc.sortOrder)) ? Number(doc.sortOrder) : 100,
    image: images[0] ?? '',
    images,
    carouselImageRefs: hasSanityRef ? carouselRefs : undefined,
    imageRef,
    excerpt: computeExcerpt(),
    body: Array.isArray(doc.body) && doc.body.length > 0 ? doc.body : null,
    featured: Boolean(doc.featured),
    featuredSortOrder: parseOptionalFiniteNumber(doc.featuredSortOrder),
    heroSpotlight: Boolean(doc.heroSpotlight),
    heroSpotlightActivatedAt:
      doc.heroSpotlightActivatedAt != null && String(doc.heroSpotlightActivatedAt).trim() !== ''
        ? String(doc.heroSpotlightActivatedAt)
        : undefined,
    seoKeywords: Array.isArray(doc.seoKeywords) ? doc.seoKeywords : undefined,
    seoTitle: st || undefined,
    seoDescription: sd || undefined
  };
}

let cache: { at: number; data: Product[] } | null = null;
let categoryCache: { at: number; data: Category[] } | null = null;
let featuredCache: { at: number; limit: number; data: Product[] } | null = null;
let heroSpotlightCache: { at: number; data: Product[] } | null = null;

export async function getAllCategories(): Promise<Category[]> {
  const ttlMs = LIST_CACHE_TTL_MS;
  if (categoryCache && ttlMs > 0 && Date.now() - categoryCache.at < ttlMs) return categoryCache.data;
  categoryCache = null;

  const client = getClient();
  if (!client) {
    warnMissingSanityConfig();
    categoryCache = { at: Date.now(), data: [] };
    return [];
  }
  type CategoryRow = { id?: string; label?: string };
  let docs: CategoryRow[] = [];
  try {
    docs = (await client.fetch<CategoryRow[]>(CATEGORY_QUERY)) ?? [];
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[Sanity] 分類 API 無法連線，先顯示空清單。', msg);
    categoryCache = null;
    return [];
  }
  const categories: Category[] = docs
    .filter((c) => Boolean(c.id) && Boolean(c.label))
    .map((c, i) => ({
      id: String(c.id).trim(),
      label: String(c.label).trim(),
      sortOrder: i
    }));
  categoryCache = { at: Date.now(), data: categories };
  return categories;
}

/** 建置／請求期間快取，避免同一 process 重複打 API */
export async function getAllProducts(): Promise<Product[]> {
  // 開發環境希望能「新增後立刻看到」，因此不啟用快取（或 TTL 極短）。
  const ttlMs = LIST_CACHE_TTL_MS;
  if (cache && ttlMs > 0 && Date.now() - cache.at < ttlMs) return cache.data;
  cache = null;

  const client = getClient();
  if (!client) {
    warnMissingSanityConfig();
    cache = { at: Date.now(), data: [] };
    return [];
  }
  const { projectId, dataset } = readSanityEnv();
  let docs: SanityProductDoc[];
  try {
    docs = await client.fetch<SanityProductDoc[]>(PRODUCT_QUERY);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[Sanity] 商品列表 API 無法連線，先顯示空清單。', msg);
    cache = null;
    return [];
  }
  const mapped = docs
    .map((d) => mapToProduct(d, projectId, dataset))
    .filter((p) => p.slug.length > 0 && p.enabled);
  cache = { at: Date.now(), data: mapped };
  return mapped;
}

/**
 * 首頁熱銷：專用 GROQ 查詢並 order，避免依賴全列表順序或錯誤的數字映射。
 * 先「有填首頁熱銷排序」再「未填」（以分類內 sortOrder）；同段內最後依名稱。
 */
/** 首頁主打通區：0～3 筆，依開啟時間新→舊 */
export async function getHeroSpotlightProducts(): Promise<Product[]> {
  const ttlMs = LIST_CACHE_TTL_MS;
  if (heroSpotlightCache && ttlMs > 0 && Date.now() - heroSpotlightCache.at < ttlMs) {
    return heroSpotlightCache.data;
  }
  heroSpotlightCache = null;

  const client = getClient();
  if (!client) {
    warnMissingSanityConfig();
    return [];
  }
  const { projectId, dataset } = readSanityEnv();
  let docs: SanityProductDoc[];
  try {
    docs = await client.fetch<SanityProductDoc[]>(HERO_SPOTLIGHT_PRODUCTS_QUERY);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[Sanity] 主打商品查詢失敗。', msg);
    return [];
  }
  const mapped = (docs ?? [])
    .map((d) => mapToProduct(d, projectId, dataset))
    .filter((p) => p.slug.length > 0 && p.enabled);
  heroSpotlightCache = { at: Date.now(), data: mapped };
  return mapped;
}

export async function getFeaturedProducts(limit = 6): Promise<Product[]> {
  const ttlMs = LIST_CACHE_TTL_MS;
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

  const client = getClient();
  if (!client) {
    warnMissingSanityConfig();
    return [];
  }
  const { projectId, dataset } = readSanityEnv();
  let docs: SanityProductDoc[];
  try {
    docs = await client.fetch<SanityProductDoc[]>(FEATURED_PRODUCTS_QUERY);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[Sanity] 首頁熱銷查詢失敗，改為自全列表篩選。', msg);
    const all = await getAllProducts();
    return [...all]
      .filter((p) => p.featured === true)
      .sort((a, b) => {
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
      })
      .slice(0, cap);
  }
  const mapped = (docs ?? [])
    .map((d) => mapToProduct(d, projectId, dataset))
    .filter((p) => p.slug.length > 0 && p.enabled)
    .slice(0, cap);
  featuredCache = { at: Date.now(), limit: cap, data: mapped };
  return mapped;
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

const PRODUCT_BY_SLUG_QUERY = `*[_type == "product" && slug.current == $slug][0] {${PRODUCT_PROJECTION}}`;

/** SSR 商品詳情頁：依 slug 查單筆（不依賴 getStaticPaths） */
export async function getProductBySlug(slug: string): Promise<Product | null> {
  const s = String(slug ?? '').trim();
  if (!s) return null;

  const client = getClient();
  if (!client) {
    warnMissingSanityConfig();
    return null;
  }
  const { projectId, dataset } = readSanityEnv();
  let doc: SanityProductDoc | null;
  try {
    doc = await client.fetch<SanityProductDoc | null>(PRODUCT_BY_SLUG_QUERY, { slug: s });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[Sanity] 單筆商品 API 無法連線。', msg);
    return null;
  }
  if (!doc?.slug) return null;
  const p = mapToProduct(doc, projectId, dataset);
  if (!p.enabled) return null;
  return p;
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

/** 建置時供 getStaticPaths 使用：所有已上架商品 slug */
export async function getAllProductSlugs(): Promise<string[]> {
  const client = getClient();
  if (!client) return [];
  try {
    const slugs = await client.fetch<string[]>(
      `*[_type == "product" && defined(slug.current) && enabled != false].slug.current`
    );
    return (slugs ?? []).map((s) => String(s).trim()).filter(Boolean);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[Sanity] 無法取得商品 slug 列表（靜態路徑）。', msg);
    return [];
  }
}
