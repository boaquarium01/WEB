/**
 * 促銷分頁：預設 Sanity；`PUBLIC_CMS=strapi` 時改走 Strapi。
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
