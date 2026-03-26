import { createClient, type SanityClient } from '@sanity/client';
import imageUrlBuilder from '@sanity/image-url';
import type { Category, Product } from '../../data/catalog';
import { PRODUCTS_PAGE_SIZE } from '../../data/catalog';

const API_VERSION = '2025-03-18';

const FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&w=1200&q=80';

/** 與 Studio schema 欄位對應 */
const PRODUCT_QUERY = `*[_type == "product" && defined(slug.current)] {
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
  description,
  featured,
  seoKeywords
}`;
const CATEGORY_QUERY = `*[_type == "category"] | order(sortOrder asc, name asc) {
  "id": slug.current,
  "label": name,
  "sortOrder": coalesce(sortOrder, 999)
}`;

const DEFAULT_PROJECT_ID = 'iz7fvprm';
const DEFAULT_DATASET = 'production';

function readSanityEnv() {
  const projectId =
    import.meta.env.PUBLIC_SANITY_PROJECT_ID?.trim() ||
    process.env.PUBLIC_SANITY_PROJECT_ID?.trim() ||
    process.env.SANITY_STUDIO_PROJECT_ID?.trim() ||
    DEFAULT_PROJECT_ID;

  const dataset =
    import.meta.env.PUBLIC_SANITY_DATASET ||
    process.env.PUBLIC_SANITY_DATASET ||
    process.env.SANITY_STUDIO_DATASET ||
    DEFAULT_DATASET;

  return { projectId, dataset };
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
    apiVersion: API_VERSION
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
  description?: string;
  featured?: boolean;
  seoKeywords?: string[];
};

function urlFromSanityImage(
  ref: Record<string, unknown> | null | undefined,
  builder: ReturnType<typeof imageUrlBuilder>
): string | null {
  if (!ref) return null;
  try {
    return builder.image(ref).width(1200).fit('max').auto('format').url();
  } catch {
    return null;
  }
}

function collectImageUrls(doc: SanityProductDoc, builder: ReturnType<typeof imageUrlBuilder>): string[] {
  const raw: string[] = [];
  const push = (u: string | null) => {
    if (u) raw.push(u);
  };
  push(urlFromSanityImage(doc.image, builder));
  const gallery = doc.gallery;
  if (Array.isArray(gallery)) {
    for (const item of gallery) {
      if (item && typeof item === 'object') push(urlFromSanityImage(item as Record<string, unknown>, builder));
    }
  }
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const u of raw) {
    if (!seen.has(u)) {
      seen.add(u);
      urls.push(u);
    }
  }
  if (urls.length === 0) urls.push(FALLBACK_IMAGE);
  return urls;
}

function mapToProduct(doc: SanityProductDoc, projectId: string, dataset: string): Product {
  const builder = imageUrlBuilder({ projectId, dataset });
  const images = collectImageUrls(doc, builder);

  const computeExcerpt = () => {
    const raw = String(doc.excerpt ?? '').trim();
    if (raw) return raw;
    const desc = String(doc.description ?? '').trim();
    if (!desc) return '';
    return desc.length > 140 ? `${desc.slice(0, 140).trim()}...` : desc;
  };

  return {
    _id: doc._id ? String(doc._id) : undefined,
    slug: String(doc.slug ?? '').trim(),
    name: String(doc.name ?? '未命名').trim() || '未命名',
    category: String(doc.category ?? '').trim() || 'uncategorized',
    categoryLabel: String(doc.categoryLabel ?? '').trim() || '未分類',
    enabled: doc.enabled !== false,
    sortOrder: Number.isFinite(Number(doc.sortOrder)) ? Number(doc.sortOrder) : 100,
    image: images[0] ?? FALLBACK_IMAGE,
    images,
    excerpt: computeExcerpt(),
    description: String(doc.description ?? ''),
    featured: Boolean(doc.featured),
    seoKeywords: Array.isArray(doc.seoKeywords) ? doc.seoKeywords : undefined
  };
}

let cache: { at: number; data: Product[] } | null = null;
let categoryCache: { at: number; data: Category[] } | null = null;

export async function getAllCategories(): Promise<Category[]> {
  const ttlMs = import.meta.env.DEV ? 0 : 60_000;
  if (categoryCache && ttlMs > 0 && Date.now() - categoryCache.at < ttlMs) return categoryCache.data;
  categoryCache = null;

  const client = getClient();
  if (!client) {
    warnMissingSanityConfig();
    categoryCache = { at: Date.now(), data: [] };
    return [];
  }
  const docs = (await client.fetch<Category[]>(CATEGORY_QUERY)) ?? [];
  const categories = docs.filter((c) => Boolean(c.id) && Boolean(c.label));
  categoryCache = { at: Date.now(), data: categories };
  return categories;
}

/** 建置／請求期間快取，避免同一 process 重複打 API */
export async function getAllProducts(): Promise<Product[]> {
  // 開發環境希望能「新增後立刻看到」，因此不啟用快取（或 TTL 極短）。
  const ttlMs = import.meta.env.DEV ? 0 : 60_000;
  if (cache && ttlMs > 0 && Date.now() - cache.at < ttlMs) return cache.data;
  cache = null;

  const client = getClient();
  if (!client) {
    warnMissingSanityConfig();
    cache = { at: Date.now(), data: [] };
    return [];
  }
  const { projectId, dataset } = readSanityEnv();
  const docs = await client.fetch<SanityProductDoc[]>(PRODUCT_QUERY);
  const mapped = docs
    .map((d) => mapToProduct(d, projectId, dataset))
    .filter((p) => p.slug.length > 0 && p.enabled);
  cache = { at: Date.now(), data: mapped };
  return mapped;
}

/** 首頁精選：有勾 featured 的優先；若皆未勾選則取前 limit 筆 */
export async function getFeaturedProducts(limit = 6): Promise<Product[]> {
  const all = await getAllProducts();
  const featured = [...all].filter((p) => p.featured).sort((a, b) => a.sortOrder - b.sortOrder);
  if (featured.length > 0) return featured.slice(0, limit);
  return [...all].sort((a, b) => a.sortOrder - b.sortOrder).slice(0, limit);
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

const PRODUCT_BY_SLUG_QUERY = `*[_type == "product" && slug.current == $slug][0] {
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
  description,
  featured,
}`;

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
  const doc = await client.fetch<SanityProductDoc | null>(PRODUCT_BY_SLUG_QUERY, { slug: s });
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
