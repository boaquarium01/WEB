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
  /** 列表與卡片用主圖（等同 images[0]）；未上傳時為空字串 */
  image: string;
  /** 詳情頁輪播：主圖 + gallery；無圖時為空陣列 */
  images: string[];
  /** 與 images 對應的 Sanity 圖片參考（供 SanityImage / srcset） */
  carouselImageRefs?: (Record<string, unknown> | null)[];
  /** 主圖 Sanity 參考（卡片優化用） */
  imageRef?: Record<string, unknown> | null;
  excerpt: string;
  /** Portable Text 商品介紹 */
  body?: unknown[] | null;
  featured?: boolean;
  /** 首頁熱銷專用排序；未設定時前台以 sortOrder 代替 */
  featuredSortOrder?: number;
  /** 首頁主打區（最多 3） */
  heroSpotlight?: boolean;
  /** 主打開啟時間（ISO），最近者排最前 */
  heroSpotlightActivatedAt?: string;
  seoKeywords?: string[];
  seoTitle?: string;
  seoDescription?: string;
};
