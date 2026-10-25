import type { APIRoute } from 'astro';
import {
	listAdminSkus,
	getProductSalesSettings,
	updateProductSalesSettings,
	updateSkuCommerceSettings,
	updateBulkSkuCommerceSettings,
	saveProductCommerceChanges,
	type SkuCommerceChange,
	type SalesSettingsChange,
} from '../../../lib/services/admin-catalog';
import { syncProductsFromSanity } from '../../../lib/services/product-sync';

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			'Content-Type': 'application/json; charset=utf-8',
			'Cache-Control': 'no-store',
		},
	});
}

function forbidden() {
	return json({ error: { message: '此帳號沒有後台權限' } }, 403);
}

async function rowsForProduct(sanityProductId: string, slug: string) {
	if (!sanityProductId && !slug) return [];
	return listAdminSkus({ ...(sanityProductId ? { sanityProductId } : { slug }) });
}

export const GET: APIRoute = async ({ locals, url }) => {
	if (!locals.user || !locals.isAdmin) return forbidden();

	const sanityProductId = url.searchParams.get('sanityProductId')?.trim() ?? '';
	const slug = url.searchParams.get('slug')?.trim() ?? '';
	if (!sanityProductId && !slug) {
		try {
			return json({ rows: await listAdminSkus() });
		} catch (error) {
			return json(
				{ error: { message: error instanceof Error ? error.message : '讀取價格與庫存失敗' } },
				500,
			);
		}
	}

	try {
		const [rows, settings] = await Promise.all([rowsForProduct(sanityProductId, slug), sanityProductId ? getProductSalesSettings(sanityProductId) : Promise.resolve(null)]);
		return json({ rows, settings });
	} catch (error) {
		return json(
			{ error: { message: error instanceof Error ? error.message : '讀取價格與庫存失敗' } },
			500,
		);
	}
};

export const POST: APIRoute = async ({ locals, request }) => {
	if (!locals.user || !locals.isAdmin) return forbidden();

	let payload: Record<string, unknown>;
	try {
		payload = await request.json();
	} catch {
		return json({ error: { message: '無效的 JSON 本文' } }, 400);
	}

	try {
		if (payload.action === 'save-changes') {
			const sanityProductId = String(payload.sanityProductId ?? '').trim();
			if (!sanityProductId || !Array.isArray(payload.changes)) return json({ error: { message: '缺少商品與變更資料' } }, 400);
			const changes: SkuCommerceChange[] = payload.changes.map((value) => {
				const row = value as Record<string, unknown>;
				return { productSkuId: String(row.productSkuId ?? ''),
					...(row.sellingPrice !== undefined ? { sellingPrice: Number(row.sellingPrice) } : {}),
					...(row.onHand !== undefined ? { onHand: row.onHand === null || row.onHand === '' ? -1 : Number(row.onHand) } : {}),
					...(row.saleEnabled !== undefined ? { saleEnabled: row.saleEnabled as boolean } : {}),
					...(row.sku !== undefined ? { sku: String(row.sku) } : {}),
					...(row.barcode !== undefined ? { barcode: row.barcode == null ? null : String(row.barcode) } : {}),
					...(row.preparationDays !== undefined ? { preparationDays: row.preparationDays == null ? null : Number(row.preparationDays) } : {}),
				};
			});
			const raw = payload.settings as Record<string, unknown> | undefined;
			const settings: SalesSettingsChange | undefined = raw ? {
				...(raw.minimumPurchaseQuantity !== undefined ? { minimumPurchaseQuantity: Number(raw.minimumPurchaseQuantity) } : {}),
				...(raw.priceTiers !== undefined ? { priceTiers: raw.priceTiers as SalesSettingsChange['priceTiers'] } : {}),
			} : undefined;
			await saveProductCommerceChanges({ sanityProductId, changes, settings, createdBy: locals.user.id });
			const [rows, savedSettings] = await Promise.all([rowsForProduct(sanityProductId, ''), getProductSalesSettings(sanityProductId)]);
			return json({ rows, settings: savedSettings, message: '變更已儲存' });
		}
		if (payload.action === 'sync') {
			const sanityProductId = String(payload.sanityProductId ?? '').trim();
			const started = performance.now();
			const result = await syncProductsFromSanity(sanityProductId || undefined);
			const syncMs = Math.round(performance.now() - started);
			if (sanityProductId && payload.includeCommerce === true && !result.errors.length) {
				const readStarted = performance.now();
				const [rows, settings] = await Promise.all([rowsForProduct(sanityProductId, ''), getProductSalesSettings(sanityProductId)]);
				return json({ result, rows, settings, timings: { syncMs, readMs: Math.round(performance.now() - readStarted), totalMs: Math.round(performance.now() - started) } });
			}
			return json({ result, timings: { syncMs } });
		}
		if (payload.action === 'save-sales-settings') {
			const sanityProductId = String(payload.sanityProductId ?? '').trim();
			const tiers = Array.isArray(payload.priceTiers) ? payload.priceTiers.map((tier) => ({
				minQuantity: Number((tier as Record<string, unknown>)?.minQuantity),
				maxQuantity: (tier as Record<string, unknown>)?.maxQuantity == null || (tier as Record<string, unknown>)?.maxQuantity === '' ? null : Number((tier as Record<string, unknown>)?.maxQuantity),
				unitPrice: Number((tier as Record<string, unknown>)?.unitPrice),
			})) : [];
			await updateProductSalesSettings({ sanityProductId, minimumPurchaseQuantity: Number(payload.minimumPurchaseQuantity), priceTiers: tiers });
			return json({ settings: await getProductSalesSettings(sanityProductId), message: '銷售設定已儲存' });
		}
		if (payload.action === 'bulk-update') {
			const sanityProductId = String(payload.sanityProductId ?? '').trim();
			const productSkuIds = Array.isArray(payload.productSkuIds) ? payload.productSkuIds.map((id) => String(id).trim()).filter(Boolean) : [];
			const sellingPrice = payload.sellingPrice === undefined ? undefined : Number(payload.sellingPrice);
			const requestedOnHand = payload.onHand === undefined ? undefined : payload.onHand === null || payload.onHand === '' ? -1 : Number(payload.onHand);
			const skuCodes = Array.isArray(payload.skuCodes) ? payload.skuCodes.map((code) => String(code).trim()) : undefined;
			if (!sanityProductId || !productSkuIds.length || productSkuIds.length > 100) return json({ error: { message: '批次套用規格資料無效' } }, 400);
			if (sellingPrice === undefined && requestedOnHand === undefined && !skuCodes) return json({ error: { message: '請選擇要批次套用的欄位' } }, 400);
			if ((sellingPrice !== undefined && (!Number.isInteger(sellingPrice) || sellingPrice < 0)) || (requestedOnHand !== undefined && (!Number.isInteger(requestedOnHand) || requestedOnHand < -1))) return json({ error: { message: '價格與庫存須為 0 或以上的整數' } }, 400);
			if (skuCodes && (skuCodes.length !== productSkuIds.length || skuCodes.some((code) => !code || code.length > 64) || new Set(skuCodes).size !== skuCodes.length)) return json({ error: { message: '批次貨號需為不重複且不超過 64 字的內容' } }, 400);
			const productRows = await rowsForProduct(sanityProductId, '');
			const rowsById = new Map(productRows.map((row) => [row.productSkuId, row]));
			if (new Set(productSkuIds).size !== productSkuIds.length || productSkuIds.some((id) => !rowsById.has(id))) return json({ error: { message: '批次套用包含不屬於此商品的規格' } }, 400);
		await updateBulkSkuCommerceSettings({
			productSkuIds,
			...(sellingPrice !== undefined ? { sellingPrice } : {}),
			...(requestedOnHand !== undefined ? { onHand: requestedOnHand } : {}),
			...(skuCodes ? { skuCodes } : {}),
			createdBy: locals.user.id,
		});
			return json({ rows: await rowsForProduct(sanityProductId, ''), message: `已套用至 ${productSkuIds.length} 個規格` });
		}

		const sanityProductId = String(payload.sanityProductId ?? '').trim();
		const productSkuId = String(payload.productSkuId ?? '').trim();
		const productRows = await rowsForProduct(sanityProductId, '');
		if (!productRows.some((row) => row.productSkuId === productSkuId)) {
			return json({ error: { message: '找不到此官網商品的電商規格' } }, 404);
		}

		await updateSkuCommerceSettings({
			productSkuId,
			sellingPrice: Number(payload.sellingPrice),
			onHand: payload.onHand === null || payload.onHand === '' ? -1 : Number(payload.onHand),
			...(payload.saleEnabled !== undefined ? { saleEnabled: payload.saleEnabled as boolean } : {}),
			...(payload.sku !== undefined ? { sku: String(payload.sku) } : {}),
			...(payload.barcode !== undefined ? { barcode: String(payload.barcode) } : {}),
			...(payload.preparationDays !== undefined ? { preparationDays: payload.preparationDays === null || payload.preparationDays === '' ? null : Number(payload.preparationDays) } : {}),
			createdBy: locals.user.id,
		});

		return json({
			rows: await rowsForProduct(sanityProductId, ''),
			message: '價格與庫存已儲存',
		});
	} catch (error) {
		return json(
			{ error: { message: error instanceof Error ? error.message : '更新價格與庫存失敗' } },
			400,
		);
	}
};
