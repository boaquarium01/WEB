import { createClient, type SanityClient } from '@sanity/client';

const API_VERSION = '2025-03-18';

function readEnv() {
  const projectId =
    import.meta.env.SANITY_STUDIO_PROJECT_ID?.trim() ||
    import.meta.env.PUBLIC_SANITY_PROJECT_ID?.trim() ||
    process.env.SANITY_STUDIO_PROJECT_ID?.trim() ||
    process.env.PUBLIC_SANITY_PROJECT_ID?.trim() ||
    '';

  const dataset =
    import.meta.env.SANITY_STUDIO_DATASET?.trim() ||
    import.meta.env.PUBLIC_SANITY_DATASET?.trim() ||
    process.env.SANITY_STUDIO_DATASET?.trim() ||
    process.env.PUBLIC_SANITY_DATASET?.trim() ||
    'production';

  const token =
    import.meta.env.SANITY_STUDIO_TOKEN?.trim() ||
    import.meta.env.SANITY_AUTH_TOKEN?.trim() ||
    import.meta.env.SANITY_API_TOKEN?.trim() ||
    import.meta.env.SANITY_WRITE_TOKEN?.trim() ||
    process.env.SANITY_STUDIO_TOKEN?.trim() ||
    process.env.SANITY_AUTH_TOKEN?.trim() ||
    process.env.SANITY_API_TOKEN?.trim() ||
    process.env.SANITY_WRITE_TOKEN?.trim() ||
    '';

  return { projectId, dataset, token };
}

export function getSanityWriteClient(): SanityClient {
  const { projectId, dataset, token } = readEnv();
  if (!projectId) {
    throw new Error('缺少 Sanity projectId（SANITY_STUDIO_PROJECT_ID 或 PUBLIC_SANITY_PROJECT_ID）');
  }
  if (!token) {
    throw new Error('缺少寫入 Token（SANITY_STUDIO_TOKEN / SANITY_AUTH_TOKEN / SANITY_API_TOKEN 等）');
  }

  return createClient({
    projectId,
    dataset,
    useCdn: false,
    apiVersion: API_VERSION,
    token
  });
}

