/**
 * 商品／分類資料：僅 Sanity。常數與型別見 ./catalog.ts。
 */

export { PRODUCTS_PAGE_SIZE, type Category, type Product } from './catalog';

export {
  getAllCategories,
  getAllProducts,
  getAllProductSlugs,
  getFeaturedProducts,
  getHeroSpotlightProducts,
  getProductBySlug,
  getProductsByCategory,
  getProductsSortedForCatalog,
  getCatalogPageCount
} from '../lib/sanity/fetchProducts';
