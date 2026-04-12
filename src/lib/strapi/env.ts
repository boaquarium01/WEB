/**
 * Strapi 後台基礎網址（無尾隨斜線），例如 http://localhost:1337
 */
export function readStrapiBaseUrl(): string {
  const u =
    import.meta.env.PUBLIC_STRAPI_URL?.trim() ||
    process.env.PUBLIC_STRAPI_URL?.trim() ||
    '';
  return u.replace(/\/+$/, '');
}

/** 設為 `strapi` 時，商品／促銷資料改走 Strapi REST；其餘維持 Sanity */
export function useStrapiCms(): boolean {
  const v = (
    import.meta.env.PUBLIC_CMS?.trim() ||
    process.env.PUBLIC_CMS?.trim() ||
    ''
  ).toLowerCase();
  return v === 'strapi';
}
