import { defineCliConfig } from 'sanity/cli';

const projectId =
  process.env.SANITY_STUDIO_PROJECT_ID ||
  process.env.PUBLIC_SANITY_PROJECT_ID ||
  'iz7fvprm';

const dataset =
  process.env.SANITY_STUDIO_DATASET ||
  process.env.PUBLIC_SANITY_DATASET ||
  'production';

export default defineCliConfig({
  api: {
    projectId,
    dataset
  },
  // 讓 `sanity deploy` 不需互動選擇 hostname，直接部署到既有
  // `https://<studioHost>.sanity.studio`（本專案是 `boaquarium`）
  studioHost: 'boaquarium'
});
