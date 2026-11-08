/**
 * 前台三個促銷分頁的固定清單，與後台「首頁陳列 → 促銷分頁」開關。
 * 開關存在 Sanity promotion 文件的 enabled 欄位；沒設定過視為開啟。
 */
import { fetchHiddenPromotionSlugs } from './sanity/fetchPromotions';

export type PromoTab = { slug: string; id: string; label: string; shortLabel: string };

export const PROMO_TABS: readonly PromoTab[] = [
	{ slug: 'weekly-new', id: 'promotion-weekly-new', label: '每週新進魚隻🐠', shortLabel: '每週新進' },
	{ slug: 'special-offers', id: 'promotion-special-offers', label: '預定優惠', shortLabel: '預定優惠' },
	{ slug: 'equipment-sale', id: 'promotion-equipment-sale', label: '器材促銷', shortLabel: '器材促銷' },
];

/** 每頁都會用到，短暫快取以免每次載入都多打一次 Sanity；後台切換後最多延遲這麼久 */
const CACHE_MS = 15_000;
let cache: { at: number; hidden: Set<string> } | null = null;

export async function getVisiblePromoTabs(): Promise<PromoTab[]> {
	if (!cache || Date.now() - cache.at > CACHE_MS) {
		const hidden = await fetchHiddenPromotionSlugs(PROMO_TABS.map((tab) => tab.id));
		// 讀取失敗時沿用上一次的結果；從沒成功過就全部顯示
		cache = hidden ? { at: Date.now(), hidden } : { at: Date.now() - CACHE_MS + 3_000, hidden: cache?.hidden ?? new Set() };
	}
	const hidden = cache.hidden;
	return PROMO_TABS.filter((tab) => !hidden.has(tab.slug));
}
