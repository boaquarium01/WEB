import { createClient, type SanityClient } from '@sanity/client';
import imageUrlBuilder from '@sanity/image-url';
import type { Product, CategoryId } from '../../data/catalog';
import { PRODUCTS_PAGE_SIZE } from '../../data/catalog';

const API_VERSION = '2025-03-18';

const FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&w=1200&q=80';

/** 與 Studio schema 欄位對應 */
const PRODUCT_QUERY = `*[_type == "product" && defined(slug.current)] {
  _id,
  name,
  "slug": slug.current,
  category,
  image,
  excerpt,
  description,
  featured,
  isPlaceholder
}`;

function getClient(): SanityClient {
  const projectId = import.meta.env.PUBLIC_SANITY_PROJECT_ID;
  const dataset = import.meta.env.PUBLIC_SANITY_DATASET || 'production';
  if (!projectId) {
    throw new Error(
      '[Sanity] 請在 .env 設定 PUBLIC_SANITY_PROJECT_ID；商品資料已改為從雲端讀取。'
    );
  }
  return createClient({
    projectId,
    dataset,
    useCdn: false,
    apiVersion: API_VERSION
  });
}

function normalizeCategory(raw: string | undefined): CategoryId {
  const allowed: CategoryId[] = ['fish', 'equipment', 'chemicals'];
  if (raw && (allowed as string[]).includes(raw)) return raw as CategoryId;
  return 'fish';
}

type SanityProductDoc = {
  slug?: string;
  name?: string;
  category?: string;
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
    category: normalizeCategory(doc.category),
    image: imageUrl,
    excerpt: String(doc.excerpt ?? ''),
    description: String(doc.description ?? ''),
    featured: Boolean(doc.featured),
    isPlaceholder: Boolean(doc.isPlaceholder)
  };
}

let cache: Product[] | null = null;

/** 建置／請求期間快取，避免同一 process 重複打 API */
export async function getAllProducts(): Promise<Product[]> {
  if (cache) return cache;
  const client = getClient();
  const projectId = import.meta.env.PUBLIC_SANITY_PROJECT_ID as string;
  const dataset = import.meta.env.PUBLIC_SANITY_DATASET || 'production';
  const docs = await client.fetch<SanityProductDoc[]>(PRODUCT_QUERY);
  const mapped = docs
    .map((d) => mapToProduct(d, projectId, dataset))
    .filter((p) => p.slug.length > 0);
  cache = mapped;
  return cache;
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
