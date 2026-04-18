/**
 * 促銷分頁：僅 Sanity。
 */

export type { Promotion } from './promotion';

export {
  getAllPromotions,
  getAllPromotionSlugs,
  getPromotionBySlug
} from '../lib/sanity/fetchPromotions';
