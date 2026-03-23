/**
 * 商品資料來源：Sanity CMS（`product` 文件）
 * 常數與型別見 ./catalog.ts；查詢見 ../lib/sanity/fetchProducts.ts
 */

export {
  PRODUCTS_PAGE_SIZE,
  CATEGORIES,
  type CategoryId,
  type Product,
  getCategoryLabel
} from './catalog';

export {
  getAllProducts,
  getFeaturedProducts,
  getProductsByCategory,
  getProductsSortedForCatalog,
  getCatalogPageCount
} from '../lib/sanity/fetchProducts';
