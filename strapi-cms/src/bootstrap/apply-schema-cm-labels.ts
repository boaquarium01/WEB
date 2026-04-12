import path from 'node:path';
import type { Core } from '@strapi/strapi';
import fse from 'fs-extra';
import _ from 'lodash';

/** 與 `schema.json` 的 `config.metadatas` 對齊；啟動時覆寫 CM 已存於 DB 的 label／description（避免舊英文蓋過中文）。 */
const UIDS = ['api::category.category', 'api::product.product', 'api::promotion.promotion'] as const;

type SchemaMetaPatch = {
  edit?: { label?: string; description?: string | null; placeholder?: string };
  list?: { label?: string };
};

/** 執行時若 content-type 物件未帶入 `config`（少數環境），改從編譯後／原始 `schema.json` 讀取。 */
function loadSchemaMetadatasFromDisk(strapi: Core.Strapi, uid: string): Record<string, SchemaMetaPatch> | null {
  const m = /^api::([^.]+)\.(.+)$/.exec(uid);
  if (!m) return null;
  const [, apiFolder, ctFolder] = m;
  const roots = [strapi.dirs.dist.src, strapi.dirs.app.src];
  for (const root of roots) {
    const filePath = path.join(root, 'api', apiFolder, 'content-types', ctFolder, 'schema.json');
    try {
      if (!fse.existsSync(filePath)) continue;
      const raw = fse.readJsonSync(filePath) as { config?: { metadatas?: Record<string, SchemaMetaPatch> } };
      const meta = raw.config?.metadatas;
      if (meta && typeof meta === 'object') return meta;
    } catch {
      /* 略過單一路徑錯誤 */
    }
  }
  return null;
}

export async function applySchemaLabelsToContentManager(strapi: Core.Strapi) {
  if (process.env.STRAPI_SKIP_CM_LABEL_SYNC === 'true') {
    return;
  }

  const cm = strapi.plugin('content-manager').service('content-types');

  for (const uid of UIDS) {
    const fullSchema = strapi.contentTypes[uid] as { config?: { metadatas?: Record<string, SchemaMetaPatch> } } | undefined;
    let schemaMetadatas = fullSchema?.config?.metadatas;
    if (!schemaMetadatas || typeof schemaMetadatas !== 'object') {
      schemaMetadatas = loadSchemaMetadatasFromDisk(strapi, uid) ?? undefined;
    }
    if (!schemaMetadatas || typeof schemaMetadatas !== 'object') {
      strapi.log.warn(`[bootstrap] ${uid} 無法取得 schema.config.metadatas（記憶體與磁碟皆無），略過欄位標籤同步`);
      continue;
    }

    const model = cm.findContentType(uid);
    if (!model) continue;

    const conf = await cm.findConfiguration(model);
    const nextMetadatas = _.cloneDeep(conf.metadatas) as Record<string, { edit?: Record<string, unknown>; list?: Record<string, unknown> }>;

    let changed = false;
    for (const [fieldName, patch] of Object.entries(schemaMetadatas)) {
      if (!nextMetadatas[fieldName]) continue;
      if (patch.edit) {
        if (typeof patch.edit.label === 'string') {
          _.set(nextMetadatas, [fieldName, 'edit', 'label'], patch.edit.label);
          changed = true;
        }
        if (patch.edit.description !== undefined) {
          _.set(nextMetadatas, [fieldName, 'edit', 'description'], patch.edit.description ?? '');
          changed = true;
        }
        if (typeof patch.edit.placeholder === 'string') {
          _.set(nextMetadatas, [fieldName, 'edit', 'placeholder'], patch.edit.placeholder);
          changed = true;
        }
      }
      if (patch.list && typeof patch.list.label === 'string') {
        _.set(nextMetadatas, [fieldName, 'list', 'label'], patch.list.label);
        changed = true;
      }
    }

    if (!changed || _.isEqual(conf.metadatas, nextMetadatas)) continue;

    try {
      await cm.updateConfiguration(model, {
        settings: conf.settings,
        layouts: conf.layouts,
        metadatas: nextMetadatas
      });
      strapi.log.info(`[bootstrap] 已自 schema 同步 Content Manager 中文欄位標籤：${uid}`);
    } catch (e) {
      strapi.log.error(`[bootstrap] 寫入 Content Manager 設定失敗（${uid}）：${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
