/// <reference types="astro/client" />
/// <reference types="@sanity/astro/module" />

interface ImportMetaEnv {
  readonly PUBLIC_SANITY_PROJECT_ID: string;
  readonly PUBLIC_SANITY_DATASET: string;
  /** Deprecated: project is Sanity-only; custom admin uses Sanity APIs. */
  readonly PUBLIC_ADMIN_BACKEND?: string;
  /**
   * Admin URL: `/admin/{ADMIN_PATH_SLUG}/dashboard` (20-48 chars, [a-zA-Z0-9_-]).
   * Local dev may use `/admin` directly. Production requires this var; otherwise `/admin*`404. Dev fallback slug if unset.
   */
  readonly ADMIN_PATH_SLUG?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
