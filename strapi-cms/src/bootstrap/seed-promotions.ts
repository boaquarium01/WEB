import type { Core } from '@strapi/strapi';

/** 與 Sanity `promotion` 固定三筆一致（slug 對應 Astro `/promo/[slug]`） */
const SANITY_EQUIVALENT_PROMOTIONS = [
  { slug: 'weekly-new', title: '每週新進魚隻🐠' },
  { slug: 'special-offers', title: '預定優惠' },
  { slug: 'equipment-sale', title: '器材促銷' }
] as const;

const UID = 'api::promotion.promotion' as const;

export async function seedSanityEquivalentPromotions(strapi: Core.Strapi): Promise<void> {
  if (process.env.STRAPI_SKIP_PROMOTION_SEED === 'true') {
    return;
  }

  for (const { slug, title } of SANITY_EQUIVALENT_PROMOTIONS) {
    const existing = await strapi.db.query(UID).findOne({
      where: { slug }
    });
    if (existing) continue;

    await strapi.db.query(UID).create({
      data: {
        slug,
        title,
        content: '\n'
      }
    });
    strapi.log.info(`[bootstrap] 已建立促銷分頁：${slug}（${title}）`);
  }
}
