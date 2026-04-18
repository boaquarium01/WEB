import { defineMiddleware } from 'astro:middleware';

/** 本機 dev 未設 `ADMIN_PATH_SLUG` 時使用（25 碼，非順編）。 */
const DEV_DEFAULT_ADMIN_PATH_SLUG = 'xK9m_pL2vNqR7wH4jF8YtZ3';

/**
 * 讀取後台路徑 slug。Vercel 等環境請在專案設定 `ADMIN_PATH_SLUG`。
 * 須優先使用 `process.env`：Vite 對 `import.meta.env` 常在建置時內嵌，執行期讀不到 Vercel 後加的變數。
 */
function readAdminPathSlugEnv(): string {
  const p =
    typeof process !== 'undefined' && typeof process.env?.ADMIN_PATH_SLUG === 'string'
      ? process.env.ADMIN_PATH_SLUG.trim()
      : '';
  const m = (import.meta.env.ADMIN_PATH_SLUG ?? '').trim();
  return p || m;
}

/** 正式環境必設；25 碼英數與 _-。本機未設時使用 {@link DEV_DEFAULT_ADMIN_PATH_SLUG}。 */
function adminPathSlug(): string {
  const raw = readAdminPathSlugEnv();
  if (/^[a-zA-Z0-9_-]{25}$/.test(raw)) return raw;
  if (import.meta.env.DEV) return DEV_DEFAULT_ADMIN_PATH_SLUG;
  return '';
}

function notFound() {
  return new Response(null, { status: 404, statusText: 'Not Found' });
}

export const onRequest = defineMiddleware((context, next) => {
  const url = new URL(context.request.url);
  const pathname = url.pathname.replace(/\/+$/, '') || '/';
  const slug = adminPathSlug();

  if (!slug) {
    if (pathname === '/admin' || pathname.startsWith('/admin/')) return notFound();
    return next();
  }

  if (pathname === '/admin' || pathname === '/admin/') {
    return notFound();
  }

  if (pathname.startsWith('/admin/')) {
    const parts = pathname.split('/').filter(Boolean);
    const first = parts[1];
    if (first === slug) return next();
    return notFound();
  }

  return next();
});
