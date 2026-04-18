import { defineMiddleware } from 'astro:middleware';

/** Fallback slug when `ADMIN_PATH_SLUG` is unset in dev (20-48 chars). `/admin/{slug}/dashboard` still works. */
const DEV_DEFAULT_ADMIN_PATH_SLUG = 'xK9m_pL2vNqR7wH4jF8YtZ3';

/**
 * Prefer `process.env.ADMIN_PATH_SLUG` so Vercel runtime env is visible (Vite may inline `import.meta.env` at build).
 */
function readAdminPathSlugEnv(): string {
  const p =
    typeof process !== 'undefined' && typeof process.env?.ADMIN_PATH_SLUG === 'string'
      ? process.env.ADMIN_PATH_SLUG.trim()
      : '';
  const m = (import.meta.env.ADMIN_PATH_SLUG ?? '').trim();
  return p || m;
}

const ADMIN_PATH_SLUG_RE = /^[a-zA-Z0-9_-]{20,48}$/;

function adminPathSlug(): string {
  const raw = readAdminPathSlugEnv();
  if (ADMIN_PATH_SLUG_RE.test(raw)) return raw;
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
  const isDev = import.meta.env.DEV;

  // Dev: dashboard at `/admin` (see src/pages/admin/index.astro)
  if (isDev && (pathname === '/admin' || pathname === '/admin/')) {
    return next();
  }

  if (!slug) {
    if (pathname === '/admin' || pathname.startsWith('/admin/')) return notFound();
    return next();
  }

  if (!isDev && (pathname === '/admin' || pathname === '/admin/')) {
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
