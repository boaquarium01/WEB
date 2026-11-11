/**
 * 折扣碼：規則檢查與金額計算（結帳預覽與實際下單共用同一套），以及後台管理。
 *
 * 規則：
 * - 可與多件優惠併用（折扣以多件優惠後的小計計算）。
 * - 勾選「排除活體」時，活體分類的商品不列入折扣與最低消費的計算。
 * - 免運門檻以「折扣後」的商品金額判斷。
 * - 用量以「未取消的訂單」計算，所以取消訂單會自動歸還次數。
 */
import { and, desc, eq, ne, sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import { discountCodes, orders } from '../db/schema';
import { getSanityClient } from '../sanity/client';
import { getShippingFee } from './shipping';

export type DiscountType = 'AMOUNT' | 'PERCENT' | 'FREE_SHIPPING';
export type DiscountCode = typeof discountCodes.$inferSelect;

type Executor = Pick<ReturnType<typeof getDb>, 'select'>;

export type DiscountLine = { productType: string | null; lineSubtotal: number };
export type DiscountQuote = {
	codeId: string;
	code: string;
	/** 折抵金額（免運碼時等於被免掉的運費） */
	discount: number;
	shippingFee: number;
	total: number;
	/** 給顧客看的一句說明 */
	label: string;
};

export class DiscountError extends Error {}

const normalizeCode = (value: string) => value.trim().toUpperCase().replace(/\s+/g, '');
const twd = (amount: number) => `NT$ ${amount.toLocaleString('zh-TW')}`;

/** 活體分類的代碼（Sanity 分類的「活體分類」開關）；短暫快取 */
let liveCache: { at: number; slugs: Set<string> } | null = null;
export async function getLiveCategorySlugs(): Promise<Set<string>> {
	if (liveCache && Date.now() - liveCache.at < 60_000) return liveCache.slugs;
	try {
		const slugs = await getSanityClient().withConfig({ useCdn: false }).fetch<string[]>(`*[_type == "category" && isLive == true].slug.current`);
		liveCache = { at: Date.now(), slugs: new Set(slugs.filter(Boolean)) };
	} catch (error) {
		console.error('[discounts] live categories unavailable', error);
		liveCache = { at: Date.now() - 50_000, slugs: liveCache?.slugs ?? new Set() };
	}
	return liveCache.slugs;
}

export function describeDiscount(code: Pick<DiscountCode, 'type' | 'value' | 'maxDiscount'>): string {
	if (code.type === 'FREE_SHIPPING') return '免運費';
	if (code.type === 'PERCENT') {
		const fold = (100 - code.value) / 10;
		return `${Number.isInteger(fold) ? fold : fold.toFixed(1)} 折${code.maxDiscount ? `（最高折 ${twd(code.maxDiscount)}）` : ''}`;
	}
	return `折 ${twd(code.value)}`;
}

/**
 * 檢查折扣碼並算出折抵後的金額。不符合時丟出 DiscountError（訊息可直接給顧客看）。
 * executor 傳交易物件時，會鎖住該折扣碼避免同時下單超過次數上限。
 */
export async function quoteDiscount(
	executor: Executor,
	input: {
		code: string;
		userId: string;
		lines: DiscountLine[];
		shippingMethod: { fee: number; freeShippingThreshold: number | null };
		lock?: boolean;
	},
): Promise<DiscountQuote> {
	const codeText = normalizeCode(input.code);
	if (!codeText) throw new DiscountError('請輸入折扣碼');
	const base = executor.select().from(discountCodes).where(eq(discountCodes.code, codeText)).limit(1);
	const [code] = input.lock ? await base.for('update') : await base;
	if (!code || !code.isActive) throw new DiscountError('折扣碼不存在或已停用');
	const now = new Date();
	if (code.startsAt && now < code.startsAt) throw new DiscountError('這組折扣碼的活動還沒開始');
	if (code.endsAt && now > code.endsAt) throw new DiscountError('這組折扣碼已過期');

	const subtotal = input.lines.reduce((sum, line) => sum + line.lineSubtotal, 0);
	const liveSlugs = code.excludeLive ? await getLiveCategorySlugs() : new Set<string>();
	const eligible = input.lines.filter((line) => !(line.productType && liveSlugs.has(line.productType))).reduce((sum, line) => sum + line.lineSubtotal, 0);
	if (code.excludeLive && eligible <= 0) throw new DiscountError('這組折扣碼不適用於活體商品');
	if (eligible < code.minSubtotal) {
		throw new DiscountError(`${code.excludeLive ? '非活體商品' : '商品'}滿 ${twd(code.minSubtotal)} 才能使用，還差 ${twd(code.minSubtotal - eligible)}`);
	}

	const active = and(eq(orders.discountCodeId, code.id), ne(orders.status, 'CANCELLED'));
	if (code.usageLimit !== null) {
		const [{ used }] = await executor.select({ used: sql<number>`count(*)::int` }).from(orders).where(active);
		if (used >= code.usageLimit) throw new DiscountError('這組折扣碼已被使用完畢');
	}
	if (code.perUserLimit !== null) {
		const [{ used }] = await executor.select({ used: sql<number>`count(*)::int` }).from(orders).where(and(active, eq(orders.userId, input.userId)));
		if (used >= code.perUserLimit) throw new DiscountError(code.perUserLimit === 1 ? '您已經使用過這組折扣碼' : `這組折扣碼每人限用 ${code.perUserLimit} 次`);
	}
	if (code.firstOrderOnly) {
		const [{ count }] = await executor.select({ count: sql<number>`count(*)::int` }).from(orders).where(and(eq(orders.userId, input.userId), ne(orders.status, 'CANCELLED')));
		if (count > 0) throw new DiscountError('這組折扣碼限首次購買使用');
	}

	let goodsDiscount = 0;
	if (code.type === 'AMOUNT') goodsDiscount = Math.min(code.value, eligible);
	else if (code.type === 'PERCENT') goodsDiscount = Math.min(Math.floor((eligible * code.value) / 100), code.maxDiscount ?? Number.MAX_SAFE_INTEGER);

	// 免運門檻看折扣後的商品金額
	let shippingFee = getShippingFee(input.shippingMethod, subtotal - goodsDiscount);
	let discount = goodsDiscount;
	if (code.type === 'FREE_SHIPPING') {
		discount = shippingFee;
		if (discount <= 0) throw new DiscountError('這筆訂單已經免運，不需要使用免運折扣碼');
	}
	return {
		codeId: code.id,
		code: code.code,
		discount,
		shippingFee,
		total: subtotal + shippingFee - discount,
		label: `${code.code}｜${describeDiscount(code)}`,
	};
}

/**
 * 找出「符合條件時自動套用」的折扣碼中最划算的一組；都不符合時回傳 null。
 * 只試算不鎖定，實際下單時仍會再用 quoteDiscount 檢查一次。
 */
export async function findAutoDiscount(
	executor: Executor,
	input: { userId: string; lines: DiscountLine[]; shippingMethod: { fee: number; freeShippingThreshold: number | null } },
): Promise<DiscountQuote | null> {
	const candidates = await executor.select({ code: discountCodes.code }).from(discountCodes)
		.where(and(eq(discountCodes.autoApply, true), eq(discountCodes.isActive, true)));
	let best: DiscountQuote | null = null;
	for (const candidate of candidates) {
		try {
			const quote = await quoteDiscount(executor, { ...input, code: candidate.code });
			if (!best || quote.total < best.total) best = quote;
		} catch (error) {
			if (!(error instanceof DiscountError)) throw error;
		}
	}
	return best;
}

// ── 後台管理 ──

export type DiscountCodeRow = DiscountCode & { usedCount: number; discountTotal: number };

export async function listDiscountCodes(): Promise<DiscountCodeRow[]> {
	const db = getDb();
	const [codes, usage] = await Promise.all([
		db.select().from(discountCodes).orderBy(desc(discountCodes.createdAt)),
		db.select({ id: orders.discountCodeId, used: sql<number>`count(*)::int`, total: sql<number>`coalesce(sum(${orders.discount}), 0)::int` })
			.from(orders)
			.where(and(sql`${orders.discountCodeId} is not null`, ne(orders.status, 'CANCELLED')))
			.groupBy(orders.discountCodeId),
	]);
	const usageById = new Map(usage.map((row) => [row.id, row]));
	return codes.map((code) => ({ ...code, usedCount: usageById.get(code.id)?.used ?? 0, discountTotal: usageById.get(code.id)?.total ?? 0 }));
}

export type DiscountCodeInput = {
	id?: string;
	code: string;
	description?: string;
	type: string;
	value: number;
	maxDiscount: number | null;
	minSubtotal: number;
	startsAt: Date | null;
	endsAt: Date | null;
	usageLimit: number | null;
	perUserLimit: number | null;
	firstOrderOnly: boolean;
	excludeLive: boolean;
	autoApply: boolean;
	isActive: boolean;
};

const wholeOrNull = (value: number | null, label: string) => {
	if (value === null) return null;
	if (!Number.isInteger(value) || value < 1) throw new Error(`${label}請輸入 1 以上的整數，或留空表示不限`);
	return value;
};

export async function saveDiscountCode(input: DiscountCodeInput): Promise<void> {
	const code = normalizeCode(input.code);
	if (!/^[A-Z0-9_-]{3,20}$/.test(code)) throw new Error('折扣碼請用 3–20 個英文字母、數字、- 或 _');
	const type = (['AMOUNT', 'PERCENT', 'FREE_SHIPPING'] as const).find((t) => t === input.type);
	if (!type) throw new Error('請選擇折扣方式');
	let value = 0;
	if (type === 'AMOUNT') {
		if (!Number.isInteger(input.value) || input.value < 1) throw new Error('折抵金額請輸入 1 以上的整數');
		value = input.value;
	} else if (type === 'PERCENT') {
		if (!Number.isInteger(input.value) || input.value < 1 || input.value > 99) throw new Error('折扣百分比請輸入 1–99（例如 10 代表 9 折）');
		value = input.value;
	}
	if (!Number.isInteger(input.minSubtotal) || input.minSubtotal < 0) throw new Error('最低消費請輸入 0 以上的整數');
	if (input.startsAt && input.endsAt && input.endsAt <= input.startsAt) throw new Error('結束時間要晚於開始時間');
	const values = {
		code,
		description: input.description?.trim().slice(0, 80) || null,
		type,
		value,
		maxDiscount: type === 'PERCENT' ? wholeOrNull(input.maxDiscount, '最高折抵') : null,
		minSubtotal: input.minSubtotal,
		startsAt: input.startsAt,
		endsAt: input.endsAt,
		usageLimit: wholeOrNull(input.usageLimit, '總次數上限'),
		perUserLimit: wholeOrNull(input.perUserLimit, '每人限用次數'),
		firstOrderOnly: input.firstOrderOnly,
		excludeLive: input.excludeLive,
		autoApply: input.autoApply,
		isActive: input.isActive,
		updatedAt: new Date(),
	};
	const db = getDb();
	const [duplicate] = await db.select({ id: discountCodes.id }).from(discountCodes).where(eq(discountCodes.code, code)).limit(1);
	if (duplicate && duplicate.id !== input.id) throw new Error(`折扣碼「${code}」已經存在`);
	if (input.id) await db.update(discountCodes).set(values).where(eq(discountCodes.id, input.id));
	else await db.insert(discountCodes).values(values);
}

export async function setDiscountCodeActive(id: string, isActive: boolean): Promise<void> {
	await getDb().update(discountCodes).set({ isActive, updatedAt: new Date() }).where(eq(discountCodes.id, id));
}

/** 只有沒被任何訂單用過的折扣碼可以刪除；用過的請改用停用 */
export async function deleteDiscountCode(id: string): Promise<void> {
	const db = getDb();
	const [{ used }] = await db.select({ used: sql<number>`count(*)::int` }).from(orders).where(eq(orders.discountCodeId, id));
	if (used > 0) throw new Error('這組折扣碼已有訂單使用，不能刪除，請改用停用');
	await db.delete(discountCodes).where(eq(discountCodes.id, id));
}
