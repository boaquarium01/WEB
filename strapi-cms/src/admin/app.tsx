import type { StrapiApp } from '@strapi/strapi/admin';
import cmFieldLabelsZh from './content-manager-field-labels.zh.json';

/**
 * 後台介面語言：zh。Content Manager 編輯表單會用
 * `content-manager.content-types.{uid}.{欄位名}` 當 i18n id，若只改 schema metadatas 可能被翻譯表蓋過或 API 未同步；
 * 此處注入繁體欄位標題，與各 api `schema.json` 的 `config.metadatas` 一致。
 * @see https://docs.strapi.io/cms/admin-panel-customization/locales-translations
 */
export default {
  config: {
    locales: ['zh'],
    translations: {
      zh: cmFieldLabelsZh as Record<string, string>
    }
  },
  bootstrap(_app: StrapiApp) {}
};
