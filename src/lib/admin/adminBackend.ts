/**
 * 自製後台資料來源：僅 Sanity（Strapi 分支已停用）。
 */
export type AdminBackend = 'sanity';

export function readAdminBackend(): AdminBackend {
  return 'sanity';
}
