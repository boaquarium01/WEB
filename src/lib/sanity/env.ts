/**
 * Sanity projectId／dataset：伺服器（Vercel）執行期務必先讀 `process.env`，
 * 避免 Vite 建置把空的 `import.meta.env.PUBLIC_*` 內嵌進 bundle，導致前台讀到預設專案、後台卻讀到環境變數。
 */
const DEFAULT_PROJECT_ID = 'iz7fvprm';
const DEFAULT_DATASET = 'production';

function trimStr(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

export function readSanityProjectDataset(): { projectId: string; dataset: string } {
  const p = typeof process !== 'undefined' && process.env ? process.env : undefined;
  const fromProcessProject =
    trimStr(p?.PUBLIC_SANITY_PROJECT_ID) || trimStr(p?.SANITY_STUDIO_PROJECT_ID);
  const fromProcessDataset = trimStr(p?.PUBLIC_SANITY_DATASET) || trimStr(p?.SANITY_STUDIO_DATASET);

  let fromMetaProject = '';
  let fromMetaDataset = '';
  try {
    fromMetaProject =
      trimStr(import.meta.env.PUBLIC_SANITY_PROJECT_ID) || trimStr(import.meta.env.SANITY_STUDIO_PROJECT_ID);
    fromMetaDataset =
      trimStr(import.meta.env.PUBLIC_SANITY_DATASET) || trimStr(import.meta.env.SANITY_STUDIO_DATASET);
  } catch {
    /* 非 Vite 建置環境 */
  }

  return {
    projectId: fromProcessProject || fromMetaProject || DEFAULT_PROJECT_ID,
    dataset: fromProcessDataset || fromMetaDataset || DEFAULT_DATASET
  };
}
