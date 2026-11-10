/**
 * 首頁主圖輪播：後台「首頁陳列」可換圖、改文字、排序、開關。
 * 存在 store_settings 的 hero_slides；沒設定過時用原本的 5 張預設圖。
 * 圖片可以是站內路徑（/hero-slide-1.png）或 Sanity CDN 網址。
 */
import { eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import { storeSettings } from '../db/schema';

export type HeroSlide = {
	id: string;
	image: string;
	title: string;
	subtitle: string;
	/** 點主圖前往的網址；留空就不能點 */
	href: string;
	enabled: boolean;
};

const KEY = 'hero_slides';
export const MAX_HERO_SLIDES = 8;

export const DEFAULT_HERO_SLIDES: HeroSlide[] = [
	{ id: 'default-1', image: '/hero-slide-1.png', title: '水博館水族｜淡水魚水族販售', subtitle: '每週新增極品特選，嚴選健康且具觀賞價值的淡水魚與水草景觀魚缸。', href: '', enabled: true },
	{ id: 'default-2', image: '/hero-slide-2.png', title: '專業、用心、苛求完美', subtitle: '以專業經驗與細節管理，提供穩定水質與健康魚況的門市服務。', href: '', enabled: true },
	{ id: 'default-3', image: '/hero-slide-3.png', title: '專業養殖與完整售後', subtitle: '服務涵蓋專業養殖、魚病治療、魚缸保養與水族器材銷售。', href: '', enabled: true },
	{ id: 'default-4', image: '/hero-slide-4.png', title: '中壢在地經營水族專賣', subtitle: '營業時間：10:00-21:00', href: '', enabled: true },
	{ id: 'default-5', image: '/hero-slide-5.png', title: '精選好魚與器材，一站購足更安心', subtitle: '地址：320桃園市中壢區環西路二段69號', href: '', enabled: true },
];

const CACHE_MS = 15_000;
let cache: { at: number; value: HeroSlide[] } | null = null;

/** 只允許站內路徑或 Sanity CDN 的圖片 */
function safeImage(src: string): string {
	if (src.startsWith('/') && !src.startsWith('//')) return src;
	try {
		const url = new URL(src);
		return url.protocol === 'https:' && url.hostname === 'cdn.sanity.io' ? `${url.origin}${url.pathname}` : '';
	} catch {
		return '';
	}
}

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

function normalize(raw: unknown): HeroSlide[] {
	const list = Array.isArray(raw) ? raw : [];
	return list
		.map((item, index) => {
			const value = (item ?? {}) as Partial<HeroSlide>;
			return {
				id: String(value.id || `slide-${Date.now()}-${index}`).slice(0, 60),
				image: safeImage(String(value.image ?? '').trim()),
				title: String(value.title ?? '').trim().slice(0, 40),
				subtitle: String(value.subtitle ?? '').trim().slice(0, 80),
				href: safeHref(String(value.href ?? '').trim()),
				enabled: value.enabled !== false,
			};
		})
		.filter((slide) => slide.image)
		.slice(0, MAX_HERO_SLIDES);
}

/** 全部輪播圖（含停用，後台用） */
export async function getHeroSlides(): Promise<HeroSlide[]> {
	if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
	try {
		const [row] = await getDb().select({ value: storeSettings.value }).from(storeSettings).where(eq(storeSettings.key, KEY)).limit(1);
		const value = row ? normalize(row.value) : DEFAULT_HERO_SLIDES;
		cache = { at: Date.now(), value };
		return value;
	} catch (error) {
		console.error('[hero-slides] unavailable', error);
		return cache?.value ?? DEFAULT_HERO_SLIDES;
	}
}

/** 前台顯示的輪播圖；全部停用時退回預設，首頁不會空白 */
export async function getActiveHeroSlides(): Promise<HeroSlide[]> {
	const active = (await getHeroSlides()).filter((slide) => slide.enabled);
	return active.length ? active : DEFAULT_HERO_SLIDES;
}

/** Sanity 圖片依寬度取用；站內圖片原樣 */
export function heroImageUrl(src: string, width: number): string {
	return src.startsWith('https://cdn.sanity.io/') ? `${src}?w=${width}&auto=format&q=80` : src;
}

export async function saveHeroSlides(input: unknown, updatedBy: string): Promise<HeroSlide[]> {
	const value = normalize(input);
	if (!value.some((slide) => slide.enabled)) throw new Error('至少要開啟一張輪播圖');
	const updatedAt = new Date();
	await getDb().insert(storeSettings).values({ key: KEY, value, updatedBy, updatedAt })
		.onConflictDoUpdate({ target: storeSettings.key, set: { value, updatedBy, updatedAt } });
	cache = null;
	return value;
}
