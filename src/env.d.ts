/// <reference types="astro/client" />
/// <reference types="@sanity/astro/module" />

interface ImportMetaEnv {
  readonly PUBLIC_SANITY_PROJECT_ID: string;
  readonly PUBLIC_SANITY_DATASET: string;
  /** 後台：`sanity`（預設，當 PUBLIC_CMS≠strapi）或 `strapi`（走 strapi-proxy） */
  readonly PUBLIC_ADMIN_BACKEND: string;
  /**
   * 自訂後台路徑：`/admin/{ADMIN_PATH_SLUG}/dashboard`（20～48 碼英數或 _-）。
   * 正式環境必設；未設時 `/admin` 與錯誤前綴皆 404。本機 dev 未設則用固定開發用亂碼。
   */
  readonly ADMIN_PATH_SLUG?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
