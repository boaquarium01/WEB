import type { Core } from '@strapi/strapi';
import { applySchemaLabelsToContentManager } from './bootstrap/apply-schema-cm-labels';
import { ensureUploadAutoOrientation } from './bootstrap/ensure-upload-auto-orient';
import { seedSanityEquivalentPromotions } from './bootstrap/seed-promotions';

/**
 * 前台 Astro 以匿名 REST 讀取內容；populate 媒體時還需 Upload 的 find/findOne，否則圖片欄位會沒有 url。
 * 啟動時若尚未建立對應 permission 則自動補上（可重跑、不會重複）。
 * 若你希望僅手動在後台勾選，可設環境變數 STRAPI_SKIP_PUBLIC_CONTENT_PERMISSIONS=true
 */
const PUBLIC_CONTENT_ACTIONS = [
  'api::category.category.find',
  'api::category.category.findOne',
  'api::product.product.find',
  'api::product.product.findOne',
  'api::promotion.promotion.find',
  'api::promotion.promotion.findOne',
  'plugin::upload.content-api.find',
  'plugin::upload.content-api.findOne'
] as const;

export default {
  register(/* { strapi }: { strapi: Core.Strapi } */) {},

  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    if (process.env.STRAPI_SKIP_PUBLIC_CONTENT_PERMISSIONS === 'true') {
      return;
    }

    await ensureUploadAutoOrientation(strapi);
    await applySchemaLabelsToContentManager(strapi);

    const publicRole = await strapi.db.query('plugin::users-permissions.role').findOne({
      where: { type: 'public' }
    });

    const roleId = publicRole?.id;
    if (roleId == null) {
      strapi.log.warn('[bootstrap] 找不到 Public 角色，略過內容 API 權限');
      return;
    }

    for (const action of PUBLIC_CONTENT_ACTIONS) {
      const existing = await strapi.db.query('plugin::users-permissions.permission').findOne({
        where: { action, role: roleId }
      });
      if (existing) continue;

      await strapi.db.query('plugin::users-permissions.permission').create({
        data: {
          action,
          role: roleId
        }
      });
      strapi.log.info(`[bootstrap] 已為 Public 開啟：${action}`);
    }

    await seedSanityEquivalentPromotions(strapi);
  }
};
