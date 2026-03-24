/**
 * 商品／分類常數與型別（資料內容來自 Sanity，見 src/lib/sanity/fetchProducts.ts）
 */

/** 列表每頁筆數 */
export const PRODUCTS_PAGE_SIZE = 12;

export type Category = {
  id: string;
  label: string;
  sortOrder: number;
};

export type Product = {
  slug: string;
  category: string;
  categoryLabel: string;
  name: string;
  image: string;
  excerpt: string;
  description: string;
  featured?: boolean;
  isPlaceholder?: boolean;
};
