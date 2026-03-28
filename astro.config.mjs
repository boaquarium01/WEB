// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import node from '@astrojs/node';
import sanity from '@sanity/astro';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import { loadEnv } from 'vite';

const env = loadEnv(process.env.NODE_ENV ?? 'development', process.cwd(), '');
/** 與 sanity.config / 讀取 API 一致；任填 PUBLIC_* 或 SANITY_STUDIO_* 即可在 dev 掛載嵌入式 Studio */
const sanityProjectId =
  env.PUBLIC_SANITY_PROJECT_ID?.trim() ||
  env.SANITY_STUDIO_PROJECT_ID?.trim() ||
  'iz7fvprm';
const sanityDataset =
  env.PUBLIC_SANITY_DATASET?.trim() || env.SANITY_STUDIO_DATASET?.trim() || 'production';

/** 本機模擬正式環境：`ASTRO_LOCAL_NODE=1` 時改用 Node adapter，才能執行 `astro preview`。上線 Vercel 建置勿設定此變數。 */
const useLocalNodeAdapter = process.env.ASTRO_LOCAL_NODE === '1';

const integrations = [
  react(),
  // 嵌入式 Studio：http://localhost:3333/admin（與 `npm run dev` 同埠，勿另開 sanity dev 佔 3333）
  sanity({
    projectId: sanityProjectId,
    dataset: sanityDataset,
    useCdn: false,
    apiVersion: '2025-03-18',
    studioBasePath: '/admin'
  })
];

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: useLocalNodeAdapter ? node({ mode: 'standalone' }) : vercel(),
  integrations,
  vite: {
    plugins: [tailwindcss()]
  }
});
