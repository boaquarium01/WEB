import { defineConfig } from 'sanity';
import { structureTool } from 'sanity/structure';
import { schemaTypes } from './sanity/schemaTypes';

/**
 * Studio 在瀏覽器執行時，Vite 未必會把 Astro 用的 `PUBLIC_SANITY_*` 注入到此設定，
 * 若 `projectId` 為空會報錯。請優先使用 `SANITY_STUDIO_*`，或保留下方預設（與你的專案一致）。
 * @see https://www.sanity.io/docs/environment-variables
 */
const projectId =
  process.env.SANITY_STUDIO_PROJECT_ID ||
  process.env.PUBLIC_SANITY_PROJECT_ID ||
  'iz7fvprm';

const dataset =
  process.env.SANITY_STUDIO_DATASET ||
  process.env.PUBLIC_SANITY_DATASET ||
  'production';

export default defineConfig({
  name: 'default',
  title: '水博館水族 CMS',
  projectId,
  dataset,
  plugins: [structureTool()],
  schema: {
    types: schemaTypes
  }
});
