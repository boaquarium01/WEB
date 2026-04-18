/**
 * Strapi 後台基礎網址（無尾隨斜線），例如 http://localhost:1337
 *
 * 優先讀執行期 `process.env`（Vercel serverless 注入）。使用 `process.env['KEY']` 避免 Vite
 * 建置時把 `process.env.PUBLIC_*` 靜態替換成 undefined。再退回 `import.meta.env`（建置內嵌）。
 */
function readProcessEnv(
  key: 'PUBLIC_STRAPI_URL' | 'PUBLIC_CMS' | 'STRAPI_API_TOKEN' | 'PUBLIC_STRAPI_API_TOKEN' | 'STRAPI_ADMIN_URL' | 'PUBLIC_STRAPI_ADMIN_URL'
): string {
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

/** 管理頁專用 base URL；未設定時才回退到一般 Strapi URL */
export function readStrapiAdminBaseUrl(): string {
  const fromProcessPrivate = readProcessEnv('STRAPI_ADMIN_URL');
  const fromProcessPublic = readProcessEnv('PUBLIC_STRAPI_ADMIN_URL');
  const fromMetaPrivate = String(import.meta.env.STRAPI_ADMIN_URL ?? '').trim();
  const fromMetaPublic = String(import.meta.env.PUBLIC_STRAPI_ADMIN_URL ?? '').trim();
  const fromAny = fromProcessPrivate || fromProcessPublic || fromMetaPrivate || fromMetaPublic || readStrapiBaseUrl();
  return fromAny.replace(/\/+$/, '');
}

/** 後台管理頁使用的 API token（建議僅於本機開發環境設定） */
export function readStrapiApiToken(): string {
  const fromProcessPrivate = readProcessEnv('STRAPI_API_TOKEN');
  const fromProcessPublic = readProcessEnv('PUBLIC_STRAPI_API_TOKEN');
  const fromMetaPrivate = String(import.meta.env.STRAPI_API_TOKEN ?? '').trim();
  const fromMetaPublic = String(import.meta.env.PUBLIC_STRAPI_API_TOKEN ?? '').trim();
  return fromProcessPrivate || fromProcessPublic || fromMetaPrivate || fromMetaPublic;
}
