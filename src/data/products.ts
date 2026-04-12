/**
 * 商品資料來源：預設 Sanity；設 `PUBLIC_CMS=strapi` 且 `PUBLIC_STRAPI_URL` 時改走 Strapi。
 * 常數與型別見 ./catalog.ts。
 */

import { useStrapiCms } from '../lib/strapi/env';

export { PRODUCTS_PAGE_SIZE, type Category, type Product } from './catalog';

import * as sanityProducts from '../lib/sanity/fetchProducts';
import * as strapiProducts from '../lib/strapi/fetchProducts';

export async function getAllCategories() {
  return useStrapiCms() ? strapiProducts.getAllCategories() : sanityProducts.getAllCategories();
}

export async function getAllProducts() {
  return useStrapiCms() ? strapiProducts.getAllProducts() : sanityProducts.getAllProducts();
}

export async function getAllProductSlugs() {
  return useStrapiCms() ? strapiProducts.getAllProductSlugs() : sanityProducts.getAllProductSlugs();
}

export async function getFeaturedProducts(limit?: number) {
  return useStrapiCms()
    ? strapiProducts.getFeaturedProducts(limit)
    : sanityProducts.getFeaturedProducts(limit);
}

export async function getHeroSpotlightProducts() {
  return useStrapiCms()
    ? strapiProducts.getHeroSpotlightProducts()
    : sanityProducts.getHeroSpotlightProducts();
}

export async function getProductBySlug(slug: string) {
  return useStrapiCms()
    ? strapiProducts.getProductBySlug(slug)
    : sanityProducts.getProductBySlug(slug);
}

export async function getProductsByCategory(categoryId: string) {
  return useStrapiCms()
    ? strapiProducts.getProductsByCategory(categoryId)
    : sanityProducts.getProductsByCategory(categoryId);
}

export async function getProductsSortedForCatalog() {
  return useStrapiCms()
    ? strapiProducts.getProductsSortedForCatalog()
    : sanityProducts.getProductsSortedForCatalog();
}

export function getCatalogPageCount(itemCount: number, pageSize?: number) {
  return useStrapiCms()
    ? strapiProducts.getCatalogPageCount(itemCount, pageSize)
    : sanityProducts.getCatalogPageCount(itemCount, pageSize);
}
