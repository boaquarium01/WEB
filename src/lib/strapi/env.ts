/**
 * Strapi 後台基礎網址（無尾隨斜線），例如 http://localhost:1337
 *
 * 優先讀執行期 `process.env`（Vercel serverless 注入）。使用 `process.env['KEY']` 避免 Vite
 * 建置時把 `process.env.PUBLIC_*` 靜態替換成 undefined。再退回 `import.meta.env`（建置內嵌）。
 */
function readProcessEnv(key: 'PUBLIC_STRAPI_URL' | 'PUBLIC_CMS'): string {
  try {
    const v = typeof process !== 'undefined' && process.env ? process.env[key] : undefined;
    return typeof v === 'string' ? v.trim() : '';
  } catch {
    return '';
  }
}

export function readStrapiBaseUrl(): string {
  const fromProcess = readProcessEnv('PUBLIC_STRAPI_URL');
  const fromMeta = String(import.meta.env.PUBLIC_STRAPI_URL ?? '').trim();
  const u = fromProcess || fromMeta;
  return u.replace(/\/+$/, '');
}

/** 設為 `strapi` 時，商品／促銷資料改走 Strapi REST；其餘維持 Sanity */
export function useStrapiCms(): boolean {
  const fromProcess = readProcessEnv('PUBLIC_CMS');
  const fromMeta = String(import.meta.env.PUBLIC_CMS ?? '').trim();
  const v = (fromProcess || fromMeta).toLowerCase();
  return v === 'strapi';
}
