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
  /** Sanity document id（夥伴管理更新/刪除用） */
  _id?: string;
  slug: string;
  category: string;
  categoryLabel: string;
  enabled: boolean;
  sortOrder: number;
  name: string;
  /** 列表與卡片用主圖（等同 images[0]） */
  image: string;
  /** 詳情頁輪播：主圖 + gallery，至少一張 */
  images: string[];
  excerpt: string;
  description: string;
  featured?: boolean;
  seoKeywords?: string[];
};
