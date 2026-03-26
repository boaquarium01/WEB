// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import sanity from '@sanity/astro';
import react from '@astrojs/react';
import { loadEnv } from 'vite';

const env = loadEnv(process.env.NODE_ENV ?? 'development', process.cwd(), '');
const sanityProjectId = env.PUBLIC_SANITY_PROJECT_ID?.trim();

const integrations = [react()];

if (sanityProjectId) {
  integrations.push(
    // 只掛載一次 Sanity integration。
    // 多個入口用 sanity.config.ts 的 workspaces 來決定：
    // workspace.name 會映射到 URL path（例如 /admin）。
    sanity({
      projectId: sanityProjectId,
      dataset: env.PUBLIC_SANITY_DATASET ?? 'production',
      useCdn: false,
      apiVersion: '2025-03-18',
      studioBasePath: '/admin'
    })
  );
}

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: vercel(),
  integrations
});
