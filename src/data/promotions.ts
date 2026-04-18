/**
 * 促銷分頁：預設 Sanity；`PUBLIC_CMS=strapi` 時改走 Strapi。
 * 若官網設為 Strapi、卻只在 Sanity Studio 編輯，前台與 Studio 會不同步；請統一資料來源或調整 `PUBLIC_CMS`／`PUBLIC_ADMIN_BACKEND`。
 */

import { useStrapiCms } from '../lib/strapi/env';

export type { Promotion } from './promotion';

import * as sanityPromo from '../lib/sanity/fetchPromotions';
import * as strapiPromo from '../lib/strapi/fetchPromotions';

export async function getAllPromotions() {
  return useStrapiCms() ? strapiPromo.getAllPromotions() : sanityPromo.getAllPromotions();
}

export async function getAllPromotionSlugs() {
  return useStrapiCms() ? strapiPromo.getAllPromotionSlugs() : sanityPromo.getAllPromotionSlugs();
}

export async function getPromotionBySlug(slug: string) {
  return useStrapiCms()
    ? strapiPromo.getPromotionBySlug(slug)
    : sanityPromo.getPromotionBySlug(slug);
}
