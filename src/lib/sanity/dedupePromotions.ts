/**
 * 促銷頁：同一 slug 只保留一筆；若重複則優先保留 schema 慣用的 document _id（避免 Studio 誤複製多一筆）。
 */
const CANONICAL_PROMOTION_ID_BY_SLUG: Record<string, string> = {
	'weekly-new': 'promotion-weekly-new',
	'special-offers': 'promotion-special-offers',
	'equipment-sale': 'promotion-equipment-sale'
};

const PROMO_LIST_ORDER = ['weekly-new', 'special-offers', 'equipment-sale'];

export function slugFromPromotionDoc(doc: { slug?: unknown }): string {
	const s = doc.slug;
	if (typeof s === 'string') return s.trim();
	if (s && typeof s === 'object' && s !== null && 'current' in s) {
		return String((s as { current?: string }).current ?? '').trim();
	}
	return '';
}

export function dedupePromotionDocuments<T extends { _id?: string; slug?: unknown }>(docs: T[]): T[] {
	const grouped = new Map<string, T[]>();
	for (const d of docs) {
		const key = slugFromPromotionDoc(d);
		if (!key) continue;
		const arr = grouped.get(key) ?? [];
		arr.push(d);
		grouped.set(key, arr);
	}
	const out: T[] = [];
	for (const [slug, group] of grouped) {
		if (group.length === 1) {
			out.push(group[0]);
			continue;
		}
		const want = CANONICAL_PROMOTION_ID_BY_SLUG[slug];
		const preferred = want ? group.find((g) => String(g._id ?? '') === want) : undefined;
		out.push(preferred ?? group[0]);
	}
	out.sort((a, b) => {
		const sa = slugFromPromotionDoc(a);
		const sb = slugFromPromotionDoc(b);
		const ia = PROMO_LIST_ORDER.indexOf(sa);
		const ib = PROMO_LIST_ORDER.indexOf(sb);
		if (ia !== -1 || ib !== -1) {
			if (ia === -1) return 1;
			if (ib === -1) return -1;
			return ia - ib;
		}
		return sa.localeCompare(sb, 'zh-Hant');
	});
	return out;
}
