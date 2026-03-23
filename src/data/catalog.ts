/**
 * 商品／分類常數與型別（資料內容來自 Sanity，見 src/lib/sanity/fetchProducts.ts）
 */

/** 列表每頁筆數 */
export const PRODUCTS_PAGE_SIZE = 12;

export const CATEGORIES = [
  { id: 'fish', label: '魚類' },
  { id: 'equipment', label: '器材' },
  { id: 'chemicals', label: '水劑' }
] as const;

export type CategoryId = (typeof CATEGORIES)[number]['id'];

export function getCategoryLabel(id: string): string {
  const c = CATEGORIES.find((x) => x.id === id);
  return c?.label ?? id;
}

export type Product = {
  slug: string;
  category: CategoryId;
  name: string;
  image: string;
  excerpt: string;
  description: string;
  featured?: boolean;
  isPlaceholder?: boolean;
};
