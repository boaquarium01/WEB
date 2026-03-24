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
  image,
  excerpt,
  description,
  featured,
  isPlaceholder
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
  slug?: string;
  name?: string;
  category?: string;
  categoryLabel?: string;
  image?: Record<string, unknown> | null;
  excerpt?: string;
  description?: string;
  featured?: boolean;
  isPlaceholder?: boolean;
};

function mapToProduct(doc: SanityProductDoc, projectId: string, dataset: string): Product {
  const builder = imageUrlBuilder({ projectId, dataset });
  let imageUrl = FALLBACK_IMAGE;
  if (doc.image) {
    try {
      imageUrl = builder.image(doc.image).width(1200).fit('max').auto('format').url();
    } catch {
      imageUrl = FALLBACK_IMAGE;
    }
  }

  return {
    slug: String(doc.slug ?? '').trim(),
    name: String(doc.name ?? '未命名').trim() || '未命名',
    category: String(doc.category ?? '').trim() || 'uncategorized',
    categoryLabel: String(doc.categoryLabel ?? '').trim() || '未分類',
    image: imageUrl,
    excerpt: String(doc.excerpt ?? ''),
    description: String(doc.description ?? ''),
    featured: Boolean(doc.featured),
    isPlaceholder: Boolean(doc.isPlaceholder)
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
    .filter((p) => p.slug.length > 0);
  cache = { at: Date.now(), data: mapped };
  return mapped;
}

/** 首頁精選：有勾 featured 的優先；若皆未勾選則取前 limit 筆 */
export async function getFeaturedProducts(limit = 6): Promise<Product[]> {
  const all = await getAllProducts();
  const featured = all.filter((p) => p.featured);
  if (featured.length > 0) return featured.slice(0, limit);
  return all.slice(0, limit);
}

export async function getProductsByCategory(categoryId: string): Promise<Product[]> {
  return (await getAllProducts()).filter((p) => p.category === categoryId);
}

export async function getProductsSortedForCatalog(): Promise<Product[]> {
  const all = await getAllProducts();
  return [...all].sort((a, b) => {
    const pa = a.isPlaceholder ? 1 : 0;
    const pb = b.isPlaceholder ? 1 : 0;
    if (pa !== pb) return pa - pb;
    return a.name.localeCompare(b.name, 'zh-Hant');
  });
}

export function getCatalogPageCount(itemCount: number, pageSize = PRODUCTS_PAGE_SIZE): number {
  if (itemCount <= 0) return 1;
  return Math.ceil(itemCount / pageSize);
}
