// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import sanity from '@sanity/astro';
import { loadEnv } from 'vite';

const env = loadEnv(process.env.NODE_ENV ?? 'development', process.cwd(), '');
const sanityProjectId = env.PUBLIC_SANITY_PROJECT_ID?.trim();

const integrations = [];

if (sanityProjectId) {
  integrations.push(
    sanity({
      projectId: sanityProjectId,
      dataset: env.PUBLIC_SANITY_DATASET ?? 'production',
      useCdn: false,
      apiVersion: '2025-03-18'
    })
  );
}

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: vercel(),
  integrations
});
