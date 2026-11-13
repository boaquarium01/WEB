/**
 * 商品管理 → 進階 → 匯出／匯入 Excel（大量編輯，類似蝦皮）。
 *
 * 檔案有兩張工作表：
 * - 「商品資料」：一列一個商品。品項全名、分類、短述、內文、規格、SEO 等；商品ID 留空＝新增商品。
 * - 「價格庫存」：一列一個規格。貨號、售價、庫存、販售、備貨天數。
 *
 * 全部在瀏覽器處理：匯入時先比對差異、讓使用者確認，確認後才逐筆寫回。
 */
import writeXlsxFile from 'write-excel-file/browser';
import readXlsxFile from 'read-excel-file/browser';

export type SkuRow = {
	productId: string;
	sanityProductId: string;
	productName: string;
	productType: string;
	productSkuId: string;
	variantKey: string | null;
	skuName: string;
	sku: string;
	sellingPrice: number;
	onHand: number;
	reserved: number;
	saleEnabled: boolean;
	skuActive: boolean;
	preparationDays: number | null;
};

type SpecOption = { _key: string; name: string; image?: { id?: string } | null };
type Spec = { _key: string; name: string; options: SpecOption[] };
type ProductDoc = {
	id: string;
	name: string;
	slug: string;
	excerpt?: string;
	body?: unknown;
	enabled?: boolean;
	seoTitle?: string;
	seoKeywords?: string[] | null;
	seoDescription?: string;
	specificationsEnabled?: boolean;
	specifications?: Spec[];
	variants?: { _key?: string }[];
	category?: { id?: string; name?: string } | null;
};
type Category = { id: string; name: string; slug: string };

type SkuChange = { productSkuId: string; sanityProductId: string; label: string; fields: string[]; patch: Record<string, unknown> };
type ProductOp = {
	kind: 'create' | 'update';
	id: string;
	label: string;
	fields: string[];
	data: Record<string, unknown>;
	needsSync: boolean;
	/** 新增商品時套用到每個規格的售價／庫存 */
	initial?: { sellingPrice: number; onHand: number };
};

export type ImportPlan = { products: ProductOp[]; skus: SkuChange[]; errors: string[]; unchanged: number };

// ── 共用 ──

const PRODUCT_SHEET = '商品資料';
const SKU_SHEET = '價格庫存';
const PRODUCT_HEADERS = ['商品ID（勿修改；留空＝新增）', '品項全名＊', '網址代號（選填）', '分類＊', '上架（是／否）', '短述', '內文', '規格1名稱', '規格1選項（用、分隔）', '規格2名稱', '規格2選項（用、分隔）', 'SEO 標題', 'SEO 關鍵字（用、分隔）', 'SEO 描述', '新商品售價（僅新增時）', '新商品庫存（僅新增時）'];
const SKU_HEADERS = ['規格ID（勿修改）', '商品ID（勿修改）', '商品名稱', '分類', '規格', '賣家貨號', '售價（留空＝價格洽詢）', '庫存（留空＝不限量）', '已預留（參考）', '販售（是／否）', '備貨天數（選填）'];

const text = (value: unknown) => (value === null || value === undefined ? '' : String(value).replace(/\r\n?/g, '\n').trim());
const splitList = (value: string) => value.split(/[、,，\n]+/).map((x) => x.trim()).filter(Boolean);
const priceText = (value: number) => (value > 0 ? `$${value.toLocaleString('zh-TW')}` : '價格洽詢');
const stockText = (value: number) => (value < 0 ? '不限量' : String(value));
const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Taipei' }).format(new Date());
const short = (value: string, max = 18) => (value.length > max ? `${value.slice(0, max)}…` : value || '（空白）');

function portableToText(body: unknown): string {
	if (typeof body === 'string') return text(body);
	if (!Array.isArray(body)) return '';
	return body
		.map((block) => {
			const b = block as { children?: { text?: string }[]; type?: string };
			return Array.isArray(b.children) ? b.children.map((child) => child?.text ?? '').join('') : '';
		})
		.join('\n')
		.trim();
}

function parseYesNo(value: unknown, label: string, row: number, fallback: boolean): boolean {
	const raw = text(value);
	if (!raw) return fallback;
	if (['是', 'Y', 'y', 'TRUE', 'true', '1', '上架', '販售'].includes(raw)) return true;
	if (['否', 'N', 'n', 'FALSE', 'false', '0', '下架', '停售'].includes(raw)) return false;
	throw new Error(`第 ${row} 列「${label}」請填「是」或「否」`);
}

function parseWhole(value: unknown, label: string, row: number, min: number, max: number): number | null {
	const raw = text(value).replace(/[,，$]/g, '');
	if (raw === '') return null;
	const number = Number(raw);
	if (!Number.isInteger(number) || number < min || number > max) throw new Error(`第 ${row} 列「${label}」要填 ${min}–${max} 的整數（目前是「${text(value)}」）`);
	return number;
}

async function sanityApi<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
	const response = await fetch('/api/admin/sanity-dashboard', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ path, method, body: body === undefined ? null : JSON.stringify(body) }),
	});
	const payload = await response.json().catch(() => null);
	if (!response.ok) throw new Error(payload?.error?.message || `HTTP ${response.status}`);
	return payload as T;
}

async function commerceApi<T>(body?: unknown): Promise<T> {
	const response = await fetch('/api/admin/product-commerce', body === undefined ? { credentials: 'same-origin' } : {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	});
	const payload = await response.json().catch(() => null);
	if (!response.ok) throw new Error(payload?.error?.message || `HTTP ${response.status}`);
	return payload as T;
}

async function loadAll() {
	const [products, categories, commerce] = await Promise.all([
		sanityApi<{ data: ProductDoc[] }>('/api/products'),
		sanityApi<{ data: Category[] }>('/api/categories'),
		commerceApi<{ rows: SkuRow[] }>(),
	]);
	return {
		products: (products.data ?? []).map((p) => ({ ...p, id: String(p.id), slug: String(p.slug ?? '') })),
		categories: (categories.data ?? []).map((c) => ({ id: String(c.id), name: String(c.name ?? ''), slug: String(c.slug ?? '') })),
		rows: commerce.rows ?? [],
	};
}

/** 只取商品目前規格對應的 SKU（下架商品的 SKU 也要列出） */
function currentSkus(rows: SkuRow[], products: ProductDoc[]): SkuRow[] {
	const keys = new Map(products.map((p) => [p.id, p.specificationsEnabled ? new Set((p.variants ?? []).map((v) => String(v._key ?? ''))) : null]));
	return rows.filter((row) => {
		if (!keys.has(row.sanityProductId)) return false;
		const set = keys.get(row.sanityProductId);
		return set ? Boolean(row.variantKey && set.has(row.variantKey)) : !row.variantKey;
	});
}

// ── 匯出 ──

export async function exportProductsExcel(): Promise<{ products: number; skus: number }> {
	const { products, categories, rows } = await loadAll();
	const categoryName = new Map(categories.map((c) => [c.id, c.name]));
	const categorySlugName = new Map(categories.map((c) => [c.slug, c.name]));
	products.sort((a, b) => (categoryName.get(a.category?.id ?? '') ?? '').localeCompare(categoryName.get(b.category?.id ?? '') ?? '', 'zh-Hant') || a.name.localeCompare(b.name, 'zh-Hant'));
	const head = (headers: string[], editableFrom: number, skip: number[] = []) =>
		headers.map((value, index) => ({ value, fontWeight: 'bold' as const, wrap: true, backgroundColor: index < editableFrom || skip.includes(index) ? '#E5E7EB' : '#E6F4F1' }));
	const cell = (value: string) => ({ value });
	const num = (value: number | null) => (value == null ? null : { value, type: Number });

	const productData = [
		head(PRODUCT_HEADERS, 1),
		...products.map((p) => {
			const specs = p.specificationsEnabled ? p.specifications ?? [] : [];
			return [
				{ value: p.id, color: '#6B7280' },
				cell(p.name ?? ''),
				cell(p.slug),
				cell(categoryName.get(p.category?.id ?? '') ?? p.category?.name ?? ''),
				cell(p.enabled === false ? '否' : '是'),
				cell(text(p.excerpt)),
				{ value: portableToText(p.body), wrap: true },
				cell(specs[0]?.name ?? ''),
				cell((specs[0]?.options ?? []).map((o) => o.name).join('、')),
				cell(specs[1]?.name ?? ''),
				cell((specs[1]?.options ?? []).map((o) => o.name).join('、')),
				cell(text(p.seoTitle)),
				cell((p.seoKeywords ?? []).join('、')),
				cell(text(p.seoDescription)),
				null,
				null,
			];
		}),
	];

	const activeRows = currentSkus(rows, products);
	activeRows.sort((a, b) => a.productName.localeCompare(b.productName, 'zh-Hant') || a.skuName.localeCompare(b.skuName, 'zh-Hant'));
	const skuData = [
		head(SKU_HEADERS, 5, [8]),
		...activeRows.map((row) => [
			{ value: row.productSkuId, color: '#6B7280' },
			{ value: row.sanityProductId, color: '#6B7280' },
			cell(row.productName),
			cell(categorySlugName.get(row.productType) ?? row.productType),
			cell(row.skuName && row.skuName !== row.productName ? row.skuName : ''),
			cell(row.sku),
			num(row.sellingPrice > 0 ? row.sellingPrice : null),
			num(row.onHand >= 0 ? row.onHand : null),
			{ value: row.reserved, type: Number, color: '#6B7280' },
			cell(row.saleEnabled ? '是' : '否'),
			num(row.preparationDays),
		]),
	];

	const workbook = writeXlsxFile([
		{ data: productData, sheet: PRODUCT_SHEET, stickyRowsCount: 1, columns: [{ width: 22 }, { width: 30 }, { width: 22 }, { width: 10 }, { width: 8 }, { width: 30 }, { width: 50 }, { width: 12 }, { width: 24 }, { width: 12 }, { width: 24 }, { width: 24 }, { width: 24 }, { width: 30 }, { width: 12 }, { width: 12 }] },
		{ data: skuData, sheet: SKU_SHEET, stickyRowsCount: 1, columns: [{ width: 14 }, { width: 14 }, { width: 30 }, { width: 10 }, { width: 18 }, { width: 18 }, { width: 14 }, { width: 14 }, { width: 10 }, { width: 10 }, { width: 12 }] },
	] as never) as unknown as { toBlob: () => Promise<Blob> };
	const blob = await workbook.toBlob();
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = `水博館商品資料_${today()}.xlsx`;
	document.body.append(link);
	link.click();
	link.remove();
	setTimeout(() => URL.revokeObjectURL(url), 10_000);
	return { products: products.length, skus: activeRows.length };
}

// ── 匯入：比對 ──

type Sheet = { sheet: string; data: unknown[][] };

function columnFinder(header: unknown[]) {
	const cells = header.map(text);
	return (prefix: string) => cells.findIndex((cell) => cell.startsWith(prefix));
}

function buildSpecs(row: unknown[], idx: Record<string, number>, rowNumber: number, previous: Spec[]): Spec[] {
	const specs: Spec[] = [];
	for (const n of [1, 2]) {
		const name = text(row[idx[`spec${n}`]]);
		const options = splitList(text(row[idx[`spec${n}o`]]));
		if (!name && !options.length) continue;
		if (!name) throw new Error(`第 ${rowNumber} 列：規格${n}有選項但沒有名稱`);
		if (!options.length) throw new Error(`第 ${rowNumber} 列：規格${n}「${name}」至少要有一個選項`);
		if (options.length > 10) throw new Error(`第 ${rowNumber} 列：規格${n}「${name}」最多 10 個選項`);
		if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) throw new Error(`第 ${rowNumber} 列：規格${n}「${name}」有重複選項`);
		const old = previous[specs.length];
		specs.push({
			_key: old?._key ?? '',
			name,
			options: options.map((optionName) => {
				const match = old?.options.find((o) => o.name.trim().toLowerCase() === optionName.toLowerCase());
				return { _key: match?._key ?? '', name: optionName, image: match?.image?.id ? { id: match.image.id } : null };
			}),
		});
	}
	if (specs.length === 1 && !text(row[idx.spec1]) && text(row[idx.spec2])) throw new Error(`第 ${rowNumber} 列：請先填規格1，再填規格2`);
	return specs;
}

const specSignature = (specs: Spec[]) => JSON.stringify(specs.map((s) => [s.name.trim(), s.options.map((o) => o.name.trim())]));

/** 讀取 Excel 並和目前資料比對，回傳要變更的項目與錯誤（不會寫入） */
export async function previewProductsExcel(file: File): Promise<ImportPlan> {
	const sheets = (await readXlsxFile(file)) as unknown as Sheet[];
	if (!Array.isArray(sheets) || !sheets.length) throw new Error('讀不到工作表，請使用「匯出 Excel」下載的檔案');
	const productSheet = sheets.find((s) => s.sheet === PRODUCT_SHEET) ?? sheets.find((s) => text(s.data?.[0]?.[1]).startsWith('品項全名'));
	const skuSheet = sheets.find((s) => s.sheet === SKU_SHEET) ?? sheets.find((s) => text(s.data?.[0]?.[0]).startsWith('規格ID'));
	if (!productSheet && !skuSheet) throw new Error('找不到「商品資料」或「價格庫存」工作表，請使用「匯出 Excel」下載的檔案');

	const { products, categories, rows } = await loadAll();
	const plan: ImportPlan = { products: [], skus: [], errors: [], unchanged: 0 };
	const productById = new Map(products.map((p) => [p.id, p]));
	const categoryByKey = new Map<string, Category>();
	for (const c of categories) {
		categoryByKey.set(c.name.toLowerCase(), c);
		categoryByKey.set(c.slug.toLowerCase(), c);
	}
	const slugOwner = new Map(products.map((p) => [p.slug, p.id]));

	// 商品資料
	if (productSheet && productSheet.data.length > 1) {
		const col = columnFinder(productSheet.data[0]);
		const idx: Record<string, number> = {
			id: col('商品ID'), name: col('品項全名'), slug: col('網址代號'), category: col('分類'), enabled: col('上架'),
			excerpt: col('短述'), body: col('內文'), spec1: col('規格1名稱'), spec1o: col('規格1選項'), spec2: col('規格2名稱'), spec2o: col('規格2選項'),
			seoTitle: col('SEO 標題'), seoKeywords: col('SEO 關鍵字'), seoDescription: col('SEO 描述'), price: col('新商品售價'), stock: col('新商品庫存'),
		};
		if (idx.id < 0 || idx.name < 0 || idx.category < 0) throw new Error('「商品資料」缺少必要欄位（商品ID、品項全名、分類），請使用匯出的檔案');
		const has = (key: string) => idx[key] >= 0;
		const seen = new Set<string>();

		productSheet.data.slice(1).forEach((cells, offset) => {
			const rowNumber = offset + 2;
			const row = cells as unknown[];
			if (row.every((c) => text(c) === '')) return;
			try {
				const id = text(row[idx.id]);
				const before = id ? productById.get(id) : undefined;
				if (id && !before) throw new Error(`第 ${rowNumber} 列：找不到商品ID「${id}」（新增商品請把商品ID留空）`);
				if (id) {
					if (seen.has(id)) throw new Error(`第 ${rowNumber} 列：同一個商品重複出現`);
					seen.add(id);
				}
				const name = text(row[idx.name]);
				if (!name) throw new Error(`第 ${rowNumber} 列「品項全名」不可空白`);
				if (name.length > 120) throw new Error(`第 ${rowNumber} 列「品項全名」最多 120 字`);
				const categoryText = text(row[idx.category]);
				const category = categoryByKey.get(categoryText.toLowerCase());
				if (!category) throw new Error(`第 ${rowNumber} 列「分類」找不到「${categoryText || '空白'}」，請填現有分類名稱：${categories.map((c) => c.name).join('、')}`);
				let slug = has('slug') ? text(row[idx.slug]).toLowerCase() : before?.slug ?? '';
				if (!slug && before) slug = before.slug;
				if (slug) {
					if (!/^[a-z0-9-]{2,60}$/.test(slug)) throw new Error(`第 ${rowNumber} 列「網址代號」只能用 2–60 個小寫英文、數字或連字號`);
					const owner = slugOwner.get(slug);
					if (owner && owner !== id) throw new Error(`第 ${rowNumber} 列「網址代號」${slug} 已被其他商品使用`);
					slugOwner.set(slug, id || `new-${rowNumber}`);
				}
				const enabled = has('enabled') ? parseYesNo(row[idx.enabled], '上架', rowNumber, before?.enabled !== false) : before?.enabled !== false;
				const excerpt = has('excerpt') ? text(row[idx.excerpt]) : text(before?.excerpt);
				const body = has('body') ? text(row[idx.body]) : portableToText(before?.body);
				const seoTitle = has('seoTitle') ? text(row[idx.seoTitle]) : text(before?.seoTitle);
				const seoKeywords = has('seoKeywords') ? splitList(text(row[idx.seoKeywords])) : before?.seoKeywords ?? [];
				const seoDescription = has('seoDescription') ? text(row[idx.seoDescription]) : text(before?.seoDescription);
				const previousSpecs = before?.specificationsEnabled ? before.specifications ?? [] : [];
				const specs = has('spec1') ? buildSpecs(row, idx, rowNumber, previousSpecs) : previousSpecs;

				if (!before) {
					const sellingPrice = has('price') ? parseWhole(row[idx.price], '新商品售價', rowNumber, 0, 9_999_999) ?? 0 : 0;
					const onHand = has('stock') ? parseWhole(row[idx.stock], '新商品庫存', rowNumber, 0, 9_999_999) ?? -1 : -1;
					const data: Record<string, unknown> = { name, category: category.id, enabled, excerpt, body, seoTitle, seoKeywords, seoDescription };
					if (slug) data.slug = slug;
					if (specs.length) { data.specificationsEnabled = true; data.specifications = specs; }
					const specLabel = specs.length ? `規格 ${specs.map((s) => `${s.name}×${s.options.length}`).join('、')}` : '單一規格';
					plan.products.push({ kind: 'create', id: '', label: name, fields: [`分類 ${category.name}`, specLabel, `售價 ${priceText(sellingPrice)}`, `庫存 ${stockText(onHand)}`, enabled ? '上架' : '下架'], data, needsSync: true, initial: { sellingPrice, onHand } });
					return;
				}

				const data: Record<string, unknown> = {};
				const fields: string[] = [];
				let needsSync = false;
				if (name !== before.name) { data.name = name; fields.push(`品項全名 ${short(before.name)} → ${short(name)}`); needsSync = true; }
				if (slug !== before.slug) { data.slug = slug; fields.push(`網址 /product/${before.slug} → /product/${slug}（舊網址與 QR 會失效）`); needsSync = true; }
				if (category.id !== before.category?.id) { data.category = category.id; fields.push(`分類 ${before.category?.name ?? '—'} → ${category.name}`); needsSync = true; }
				if (enabled !== (before.enabled !== false)) { data.enabled = enabled; fields.push(enabled ? '改為上架' : '改為下架'); needsSync = true; }
				if (excerpt !== text(before.excerpt)) { data.excerpt = excerpt; fields.push(`短述 ${short(text(before.excerpt))} → ${short(excerpt)}`); }
				if (body !== portableToText(before.body)) {
					const hasImages = Array.isArray(before.body) && (before.body as { _type?: string }[]).some((block) => block?._type === 'image');
					if (hasImages) plan.errors.push(`第 ${rowNumber} 列「${before.name}」的內文含圖片，Excel 無法修改內文（其他欄位照常套用），請到後台編輯內文`);
					else { data.body = body; fields.push('內文已修改'); }
				}
				if (seoTitle !== text(before.seoTitle)) { data.seoTitle = seoTitle; fields.push(`SEO 標題 → ${short(seoTitle)}`); }
				if (JSON.stringify(seoKeywords) !== JSON.stringify(before.seoKeywords ?? [])) { data.seoKeywords = seoKeywords; fields.push(`SEO 關鍵字 → ${short(seoKeywords.join('、'), 30)}`); }
				if (seoDescription !== text(before.seoDescription)) { data.seoDescription = seoDescription; fields.push(`SEO 描述 → ${short(seoDescription)}`); }
				if (specSignature(specs) !== specSignature(previousSpecs)) {
					needsSync = true;
					if (specs.length) { data.specificationsEnabled = true; data.specifications = specs; }
					else data.specificationsEnabled = false;
					const removed = previousSpecs.flatMap((s, i) => s.options.filter((o) => !specs[i]?.options.some((n) => n._key === o._key)).map((o) => o.name));
					fields.push(`規格 → ${specs.length ? specs.map((s) => `${s.name}（${s.options.map((o) => o.name).join('、')}）`).join('／') : '單一規格'}${removed.length ? `；移除的選項會停售：${removed.join('、')}` : ''}`);
				}
				if (!fields.length) { plan.unchanged += 1; return; }
				plan.products.push({ kind: 'update', id: before.id, label: before.name, fields, data, needsSync });
			} catch (error) {
				plan.errors.push(error instanceof Error ? error.message : `第 ${rowNumber} 列資料有誤`);
			}
		});
	}

	// 價格庫存
	if (skuSheet && skuSheet.data.length > 1) {
		const col = columnFinder(skuSheet.data[0]);
		const idx = { id: col('規格ID'), sku: col('賣家貨號'), price: col('售價'), stock: col('庫存'), sale: col('販售'), prep: col('備貨天數') };
		if (idx.id < 0 || idx.price < 0 || idx.stock < 0) throw new Error('「價格庫存」缺少必要欄位（規格ID、售價、庫存），請使用匯出的檔案');
		const current = new Map(rows.map((row) => [row.productSkuId, row]));
		const seen = new Set<string>();
		skuSheet.data.slice(1).forEach((cells, offset) => {
			const rowNumber = offset + 2;
			const row = cells as unknown[];
			if (row.every((c) => text(c) === '')) return;
			const id = text(row[idx.id]);
			const prefix = `「價格庫存」第 ${rowNumber} 列`;
			const before = current.get(id);
			if (!before) { plan.errors.push(`${prefix}：找不到規格（規格ID 可能被修改或商品已刪除；新商品請在「商品資料」新增）`); return; }
			if (seen.has(id)) { plan.errors.push(`${prefix}：同一個規格重複出現`); return; }
			seen.add(id);
			try {
				const fields: string[] = [];
				const patch: Record<string, unknown> = {};
				const price = parseWhole(row[idx.price], '售價', rowNumber, 0, 9_999_999) ?? 0;
				if (price !== before.sellingPrice) { patch.sellingPrice = price; fields.push(`售價 ${priceText(before.sellingPrice)} → ${priceText(price)}`); }
				const stock = parseWhole(row[idx.stock], '庫存', rowNumber, 0, 9_999_999) ?? -1;
				if (stock !== before.onHand) {
					if (stock >= 0 && stock < before.reserved) throw new Error(`${prefix}「庫存」不能低於已預留的 ${before.reserved} 件`);
					patch.onHand = stock; fields.push(`庫存 ${stockText(before.onHand)} → ${stockText(stock)}`);
				}
				if (idx.sale >= 0) {
					const sale = parseYesNo(row[idx.sale], '販售', rowNumber, before.saleEnabled);
					if (sale !== before.saleEnabled) { patch.saleEnabled = sale; fields.push(`販售 ${before.saleEnabled ? '是' : '否'} → ${sale ? '是' : '否'}`); }
				}
				if (idx.sku >= 0) {
					const code = text(row[idx.sku]);
					if (!code || code.length > 64) throw new Error(`${prefix}「賣家貨號」不可空白且最多 64 字`);
					if (code !== before.sku) { patch.sku = code; fields.push(`貨號 ${before.sku} → ${code}`); }
				}
				if (idx.prep >= 0) {
					const prep = parseWhole(row[idx.prep], '備貨天數', rowNumber, 0, 365);
					if (prep !== before.preparationDays) { patch.preparationDays = prep; fields.push(`備貨天數 ${before.preparationDays ?? '—'} → ${prep ?? '—'}`); }
				}
				if (!fields.length) { plan.unchanged += 1; return; }
				const label = before.skuName && before.skuName !== before.productName ? `${before.productName}（${before.skuName}）` : before.productName;
				plan.skus.push({ productSkuId: id, sanityProductId: before.sanityProductId, label, fields, patch });
			} catch (error) {
				plan.errors.push(error instanceof Error ? error.message.replace(`第 ${rowNumber} 列`, prefix) : `${prefix}資料有誤`);
			}
		});
	}
	return plan;
}

/** 給確認視窗看的摘要 */
export function describePlan(plan: ImportPlan, limit = 14): string {
	const lines: string[] = [];
	const creates = plan.products.filter((p) => p.kind === 'create');
	const updates = plan.products.filter((p) => p.kind === 'update');
	const all = [
		...creates.map((p) => `＋ 新增「${p.label}」：${p.fields.join('、')}`),
		...updates.map((p) => `• ${p.label}：${p.fields.join('、')}`),
		...plan.skus.map((s) => `• ${s.label}：${s.fields.join('、')}`),
	];
	lines.push(...all.slice(0, limit));
	if (all.length > limit) lines.push(`…另有 ${all.length - limit} 筆`);
	if (plan.errors.length) lines.push('', `⚠ ${plan.errors.length} 列有錯誤，會略過：`, ...plan.errors.slice(0, 5).map((e) => `• ${e}`), ...(plan.errors.length > 5 ? [`…另有 ${plan.errors.length - 5} 個錯誤`] : []));
	return lines.join('\n');
}

export const planCount = (plan: ImportPlan) => plan.products.length + plan.skus.length;

// ── 匯入：寫回 ──

type SyncResult = { rows?: SkuRow[]; result?: { errors?: { message?: string }[] } };

async function syncProduct(sanityProductId: string): Promise<SkuRow[]> {
	const synced = await commerceApi<SyncResult>({ action: 'sync', sanityProductId, includeCommerce: true });
	if (synced.result?.errors?.length || !Array.isArray(synced.rows)) throw new Error(synced.result?.errors?.[0]?.message || '商品同步失敗');
	return synced.rows;
}

export async function applyProductPlan(plan: ImportPlan, onProgress: (done: number, total: number) => void): Promise<{ saved: number; failed: string[] }> {
	const total = planCount(plan);
	let done = 0;
	let saved = 0;
	const failed: string[] = [];
	const tick = () => onProgress(++done, total);

	for (const op of plan.products) {
		try {
			if (op.kind === 'create') {
				const { specifications, specificationsEnabled, ...base } = op.data;
				const created = await sanityApi<{ data: { id: string } }>('/api/products', 'POST', { data: { ...base, specificationsEnabled: false } });
				const id = String(created?.data?.id ?? '');
				if (!id) throw new Error('建立後沒有取得商品ID');
				if (specificationsEnabled) await sanityApi(`/api/products/${encodeURIComponent(id)}`, 'PUT', { data: { specificationsEnabled: true, specifications } });
				const rows = await syncProduct(id);
				if (op.initial && rows.length && (op.initial.sellingPrice > 0 || op.initial.onHand >= 0)) {
					await commerceApi({ action: 'save-changes', sanityProductId: id, changes: rows.map((row) => ({ productSkuId: row.productSkuId, sellingPrice: op.initial!.sellingPrice, onHand: op.initial!.onHand })) });
				}
			} else {
				await sanityApi(`/api/products/${encodeURIComponent(op.id)}`, 'PUT', { data: op.data });
				if (op.needsSync) await syncProduct(op.id);
			}
			saved += 1;
		} catch (error) {
			failed.push(`${op.label}：${error instanceof Error ? error.message : '儲存失敗'}`);
		}
		tick();
	}

	const groups = new Map<string, SkuChange[]>();
	for (const change of plan.skus) groups.set(change.sanityProductId, [...(groups.get(change.sanityProductId) ?? []), change]);
	for (const [sanityProductId, items] of groups) {
		try {
			await commerceApi({ action: 'save-changes', sanityProductId, changes: items.map((item) => ({ productSkuId: item.productSkuId, ...item.patch })) });
			saved += items.length;
		} catch (error) {
			failed.push(`${items[0].label}：${error instanceof Error ? error.message : '儲存失敗'}`);
		}
		for (let i = 0; i < items.length; i += 1) tick();
	}
	return { saved, failed };
}
