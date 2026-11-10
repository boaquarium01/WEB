/**
 * 頂部公告條：全站（或只在首頁）最上方輪播的短訊息，後台「首頁陳列」可編輯。
 * 存在 store_settings 的 announcement_bar；沒設定過時用預設內容。
 */
import { eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import { storeSettings } from '../db/schema';

export type AnnouncementItem = {
	/** 醒目小標籤，例如「限時優惠」；留空就不顯示 */
	badge: string;
	text: string;
	/** 點擊前往的網址，留空就不能點 */
	href: string;
};

export type AnnouncementBar = {
	enabled: boolean;
	homeOnly: boolean;
	items: AnnouncementItem[];
};

const KEY = 'announcement_bar';
export const MAX_ANNOUNCEMENTS = 10;

export const DEFAULT_ANNOUNCEMENT: AnnouncementBar = {
	enabled: true,
	homeOnly: false,
	items: [
		{ badge: '限時優惠', text: '🚚 全館滿 $1,200 免運｜運費只要 $99', href: '/shopping-guide#shipping-fee' },
		{ badge: '新魚到貨', text: '🐠 每週新進魚隻到貨，數量有限，手慢無！', href: '/promo/weekly-new' },
		{ badge: '', text: '🕙 門市 10:00–21:00｜中壢環西路二段 69 號', href: '/#contact' },
	],
};

/** 每頁都會讀，短暫快取；後台儲存後立即清掉 */
const CACHE_MS = 15_000;
let cache: { at: number; value: AnnouncementBar } | null = null;

function normalize(raw: unknown): AnnouncementBar {
	const value = (raw ?? {}) as Partial<AnnouncementBar>;
	const items = Array.isArray(value.items) ? value.items : [];
	return {
		enabled: value.enabled !== false,
		homeOnly: value.homeOnly === true,
		items: items
			.map((item) => ({
				badge: String(item?.badge ?? '').trim().slice(0, 8),
				text: String(item?.text ?? '').trim().slice(0, 60),
				href: String(item?.href ?? '').trim().slice(0, 200),
			}))
			.filter((item) => item.text)
			.slice(0, MAX_ANNOUNCEMENTS),
	};
}

export async function getAnnouncementBar(): Promise<AnnouncementBar> {
	if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
	try {
		const [row] = await getDb().select({ value: storeSettings.value }).from(storeSettings).where(eq(storeSettings.key, KEY)).limit(1);
		const value = row ? normalize(row.value) : DEFAULT_ANNOUNCEMENT;
		cache = { at: Date.now(), value };
		return value;
	} catch (error) {
		console.error('[announcement] unavailable', error);
		return cache?.value ?? { ...DEFAULT_ANNOUNCEMENT, enabled: false };
	}
}

/** 只允許站內路徑（/ 開頭）或 https 網址，避免存進奇怪的連結 */
function safeHref(href: string): string {
	if (!href) return '';
	if (href.startsWith('/') && !href.startsWith('//')) return href;
	try {
		const url = new URL(href);
		return url.protocol === 'https:' ? url.toString() : '';
	} catch {
		return '';
	}
}

export async function saveAnnouncementBar(input: unknown, updatedBy: string): Promise<AnnouncementBar> {
	const value = normalize(input);
	value.items = value.items.map((item) => ({ ...item, href: safeHref(item.href) }));
	if (value.enabled && value.items.length === 0) throw new Error('開啟公告條至少要有一則訊息');
	const updatedAt = new Date();
	await getDb().insert(storeSettings).values({ key: KEY, value, updatedBy, updatedAt })
		.onConflictDoUpdate({ target: storeSettings.key, set: { value, updatedBy, updatedAt } });
	cache = null;
	return value;
}
