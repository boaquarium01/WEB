import { config } from 'dotenv';

config();

import { defineConfig } from 'sanity';
import { structureTool } from 'sanity/structure';
import { schemaTypes } from './sanity/schemaTypes';

const projectId = process.env.PUBLIC_SANITY_PROJECT_ID ?? '';
const dataset = process.env.PUBLIC_SANITY_DATASET ?? 'production';

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
