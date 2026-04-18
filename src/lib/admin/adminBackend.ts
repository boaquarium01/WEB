/**
 * 自製後台資料來源：`sanity`（預設，與 PUBLIC_CMS≠strapi 一致）或 `strapi`（走 strapi-proxy）。
 * 可強制指定 `PUBLIC_ADMIN_BACKEND=sanity|strapi`。
 */
import { useStrapiCms } from '../strapi/env';

export type AdminBackend = 'sanity' | 'strapi';

export function readAdminBackend(): AdminBackend {
	const fromProcess = typeof process !== 'undefined' && process.env?.PUBLIC_ADMIN_BACKEND?.trim();
	const fromMeta = String(import.meta.env.PUBLIC_ADMIN_BACKEND ?? '').trim();
	const v = (fromProcess || fromMeta || '').toLowerCase();
	if (v === 'strapi') return 'strapi';
	if (v === 'sanity') return 'sanity';
	return useStrapiCms() ? 'strapi' : 'sanity';
}
