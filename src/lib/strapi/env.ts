/**
 * Strapi 後台基礎網址（無尾隨斜線），例如 http://localhost:1337
 *
 * 優先讀 `process.env`（Vercel 等託管常在「執行期」注入），再退回 `import.meta.env`（建置時內嵌）。
 * 避免僅在儀表板設變數、建置階段未帶到而對外站永遠連不到 Strapi。
 */
export function readStrapiBaseUrl(): string {
  const fromProcess =
    typeof process !== 'undefined' && typeof process.env.PUBLIC_STRAPI_URL === 'string'
      ? process.env.PUBLIC_STRAPI_URL.trim()
      : '';
  const fromMeta = String(import.meta.env.PUBLIC_STRAPI_URL ?? '').trim();
  const u = fromProcess || fromMeta;
  return u.replace(/\/+$/, '');
}

/** 設為 `strapi` 時，商品／促銷資料改走 Strapi REST；其餘維持 Sanity */
export function useStrapiCms(): boolean {
  const fromProcess =
    typeof process !== 'undefined' && typeof process.env.PUBLIC_CMS === 'string'
      ? process.env.PUBLIC_CMS.trim()
      : '';
  const fromMeta = String(import.meta.env.PUBLIC_CMS ?? '').trim();
  const v = (fromProcess || fromMeta).toLowerCase();
  return v === 'strapi';
}
