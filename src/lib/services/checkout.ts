import { randomInt } from 'node:crypto';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import { availableStock } from '../db/inventory';
import {
	cartItems,
	carts,
	inventory,
	inventoryMovements,
	locations,
	orderItems,
	orderStatusHistory,
	orders,
	payments,
	productSkus,
	productPriceTiers,
	products,
	shippingMethods,
} from '../db/schema';
import { ensureCustomerForUser } from './customer';
import { getAddressForUser, type Address } from './address';
import { getCartView } from './cart';
import { getShippingFee } from './shipping';
import { unitPriceForQuantity, type QuantityPriceTier } from './quantity-pricing';

export type ShippingAddressSnapshot = {
	addressId: string;
	label: string | null;
	recipientName: string;
	phone: string;
	postalCode: string;
	city: string;
	district: string;
	addressLine: string;
	shippingMethodId?: string;
	shippingMethodName?: string;
};

export type PlaceOrderInput = {
	addressId: string;
	shippingMethodId: string;
	note?: string;
	cartItemIds?: string[];
};

export type PlaceOrderResult = {
	orderId: string;
	orderNumber: string;
	total: number;
	status: string;
};

function snapshotAddress(address: Address, method: { id: string; name: string }): ShippingAddressSnapshot {
	return {
		addressId: address.id,
		label: address.label,
		recipientName: address.recipientName,
		phone: address.phone,
		postalCode: address.postalCode,
		city: address.city,
		district: address.district,
		addressLine: address.addressLine,
		shippingMethodId: method.id,
		shippingMethodName: method.name,
	};
}

async function generateOrderNumber(tx: Tx): Promise<string> {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: 'Asia/Taipei',
		year: '2-digit',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		hourCycle: 'h23',
	}).formatToParts(new Date());
	const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '00';
	const prefix = `${value('year')}${value('month')}${value('day')}-${value('hour')}`;

	// Serialize allocation within the same hour, then probe available letter pairs.
	await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${prefix}))`);
	for (let attempt = 0; attempt < 676; attempt += 1) {
		const suffix = `${String.fromCharCode(65 + randomInt(26))}${String.fromCharCode(65 + randomInt(26))}`;
		const candidate = `${prefix}${suffix}`;
		const [existing] = await tx
			.select({ id: orders.id })
			.from(orders)
			.where(eq(orders.orderNumber, candidate))
			.limit(1);
		if (!existing) return candidate;
	}
	throw new Error('此小時訂單編號已用完，請稍後再試');
}

type Tx = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0];

/**
 * Place order from the user's ACTIVE cart.
 * Browser may only submit addressId + note; all money/stock is recomputed server-side.
 */
export async function placeOrderFromCart(
	userId: string,
	input: PlaceOrderInput,
): Promise<PlaceOrderResult> {
	const addressId = String(input.addressId ?? '').trim();
	const shippingMethodId = String(input.shippingMethodId ?? '').trim();
	const selectedCartItemIds = input.cartItemIds?.map((id) => String(id).trim()).filter(Boolean);
	if (!addressId) {
		throw new Error('請選擇收件地址');
	}
	if (!shippingMethodId) throw new Error('請選擇配送方式');
	if (selectedCartItemIds && selectedCartItemIds.length === 0) throw new Error('請至少選擇一項商品');
	if (selectedCartItemIds?.some((id) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) {
		throw new Error('所選商品資料無效，請返回購物車重新選擇');
	}

	const note = String(input.note ?? '').trim() || null;
	const address = await getAddressForUser(userId, addressId);
	if (!address) {
		throw new Error('找不到收件地址');
	}

	const customer = await ensureCustomerForUser(userId);
	const cartPreview = await getCartView(userId);
	if (cartPreview.items.length === 0) {
		throw new Error('購物車是空的');
	}

	const db = getDb();

	return db.transaction(async (tx) => {
		const [shippingMethod] = await tx.select({ id: shippingMethods.id, name: shippingMethods.name, fee: shippingMethods.fee, freeShippingThreshold: shippingMethods.freeShippingThreshold })
			.from(shippingMethods)
			.where(and(eq(shippingMethods.id, shippingMethodId), eq(shippingMethods.isActive, true)))
			.limit(1);
		if (!shippingMethod) throw new Error('所選配送方式目前無法使用，請重新選擇');

		const [cart] = await tx
			.select()
			.from(carts)
			.where(and(eq(carts.userId, userId), eq(carts.status, 'ACTIVE')))
			.limit(1);

		if (!cart) {
			throw new Error('找不到購物車');
		}

		const lineConditions = [eq(cartItems.cartId, cart.id)];
		if (selectedCartItemIds) lineConditions.push(inArray(cartItems.id, selectedCartItemIds));
		const lines = await tx
			.select({
				cartItemId: cartItems.id,
				productSkuId: cartItems.productSkuId,
				quantity: cartItems.quantity,
				productId: products.id,
				productName: products.name,
				sku: productSkus.sku,
				skuName: productSkus.name,
			unitPrice: productSkus.sellingPrice,
			minimumPurchaseQuantity: products.minimumPurchaseQuantity,
				skuActive: sql<boolean>`${productSkus.isActive} AND ${productSkus.saleEnabled}`,
				productActive: products.isActive,
				productOnline: products.isOnline,
			})
			.from(cartItems)
			.innerJoin(productSkus, eq(cartItems.productSkuId, productSkus.id))
			.innerJoin(products, eq(productSkus.productId, products.id))
			.where(and(...lineConditions));

		if (lines.length === 0) {
			throw new Error(selectedCartItemIds ? '所選商品已不在購物車，請重新選擇' : '購物車是空的');
		}
		if (selectedCartItemIds && lines.length !== new Set(selectedCartItemIds).size) {
			throw new Error('購物車內容已變更，請返回購物車重新選擇');
		}
		const productIds = [...new Set(lines.map((line) => line.productId))];
		const tiers = productIds.length ? await tx.select({
			productId: productPriceTiers.productId,
			minQuantity: productPriceTiers.minQuantity,
			maxQuantity: productPriceTiers.maxQuantity,
			unitPrice: productPriceTiers.unitPrice,
		}).from(productPriceTiers).where(inArray(productPriceTiers.productId, productIds)).orderBy(asc(productPriceTiers.sortOrder)) : [];
		const tiersByProduct = new Map<string, QuantityPriceTier[]>();
		for (const tier of tiers) tiersByProduct.set(tier.productId, [...(tiersByProduct.get(tier.productId) ?? []), tier]);
		const quantityByProduct = new Map<string, number>();
		for (const line of lines) quantityByProduct.set(line.productId, (quantityByProduct.get(line.productId) ?? 0) + line.quantity);
		for (const line of lines) {
			if (quantityByProduct.get(line.productId)! < line.minimumPurchaseQuantity) {
				throw new Error(`「${line.productName}」最低購買數量為 ${line.minimumPurchaseQuantity} 件`);
			}
		}

		let subtotal = 0;
		const prepared: Array<{
			cartItemId: string;
			productId: string;
			productSkuId: string;
			productName: string;
			sku: string;
			skuName: string;
			unitPrice: number;
			quantity: number;
			lineSubtotal: number;
		}> = [];

		for (const line of lines) {
			if (!line.skuActive || !line.productActive || !line.productOnline) {
				throw new Error(`「${line.productName}」目前無法購買`);
			}
			if (!Number.isInteger(line.quantity) || line.quantity < 1) {
				throw new Error('購物車數量無效');
			}

			const reservedQty = await reserveSkuStock(
				tx,
				{
					productSkuId: line.productSkuId,
					quantity: line.quantity,
					userId,
					cartId: cart.id,
				},
			);

			if (reservedQty < line.quantity) {
				throw new Error(
					`「${line.productName}」庫存不足（可預留 ${reservedQty}）`,
				);
			}

			const productQuantity = quantityByProduct.get(line.productId) ?? line.quantity;
			const unitPrice = unitPriceForQuantity(line.unitPrice, productQuantity, tiersByProduct.get(line.productId) ?? []);
			const lineSubtotal = unitPrice * line.quantity;
			subtotal += lineSubtotal;
			prepared.push({
				cartItemId: line.cartItemId,
				productId: line.productId,
				productSkuId: line.productSkuId,
				productName: line.productName,
				sku: line.sku,
				skuName: line.skuName,
				unitPrice,
				quantity: line.quantity,
				lineSubtotal,
			});
		}

		const shippingFee = getShippingFee(shippingMethod, subtotal);
		const discount = 0;
		const total = subtotal + shippingFee - discount;
		if (total < 0) {
			throw new Error('訂單金額無效');
		}

		const orderNumber = await generateOrderNumber(tx);
		const shippingAddress = snapshotAddress(address, shippingMethod);

		const [order] = await tx
			.insert(orders)
			.values({
				orderNumber,
				userId,
				customerId: customer.id,
				status: 'PENDING_PAYMENT',
				subtotal,
				shippingFee,
				discount,
				total,
				paymentStatus: 'UNPAID',
				shippingStatus: 'NOT_SHIPPED',
				shippingAddress,
				note,
			})
			.returning();

		if (!order) {
			throw new Error('無法建立訂單');
		}
		await tx.insert(orderStatusHistory).values({
			orderId: order.id,
			status: order.status,
			paymentStatus: order.paymentStatus,
			shippingStatus: order.shippingStatus,
			createdAt: order.createdAt,
		});

		await tx.insert(orderItems).values(
			prepared.map((item) => ({
				orderId: order.id,
				productId: item.productId,
				productSkuId: item.productSkuId,
				productName: item.productName,
				sku: item.sku,
				skuNameSnapshot: item.skuName,
				unitPrice: item.unitPrice,
				quantity: item.quantity,
				subtotal: item.lineSubtotal,
				costSnapshot: null,
			})),
		);

		await tx.insert(payments).values({
			orderId: order.id,
			method: 'BANK_TRANSFER',
			amount: total,
			status: 'PENDING',
		});

		await tx
			.update(inventoryMovements)
			.set({
				referenceType: 'order',
				referenceId: order.id,
				note: `線上結帳庫存預留 → 訂單 ${order.orderNumber}`,
			})
			.where(
				and(
					eq(inventoryMovements.referenceType, 'checkout_pending'),
					eq(inventoryMovements.referenceId, cart.id),
				),
			);

		await tx.delete(cartItems).where(and(
			eq(cartItems.cartId, cart.id),
			inArray(cartItems.id, prepared.map((item) => item.cartItemId)),
		));
		const remainingItems = await tx.select({ id: cartItems.id }).from(cartItems).where(eq(cartItems.cartId, cart.id)).limit(1);
		await tx
			.update(carts)
			.set({ ...(remainingItems.length === 0 ? { status: 'CHECKED_OUT' as const } : {}), updatedAt: new Date() })
			.where(eq(carts.id, cart.id));

		return {
			orderId: order.id,
			orderNumber: order.orderNumber,
			total: order.total,
			status: order.status,
		};
	});
}

async function reserveSkuStock(
	tx: Tx,
	args: {
		productSkuId: string;
		quantity: number;
		userId: string;
		cartId: string;
	},
): Promise<number> {
	const { productSkuId, quantity, userId, cartId } = args;

	const [store] = await tx
		.select()
		.from(locations)
		.where(and(eq(locations.type, 'STORE'), eq(locations.isActive, true)))
		.orderBy(asc(locations.createdAt))
		.limit(1);

	if (!store) {
		throw new Error('尚未設定 STORE 庫存地點');
	}

	const rows = await tx
		.select()
		.from(inventory)
		.where(
			and(
				eq(inventory.productSkuId, productSkuId),
				eq(inventory.locationId, store.id),
			),
		)
		.for('update');

	if (rows.length === 0) {
		return quantity;
	}
	if (rows.some((row) => row.onHand < 0)) return quantity;

	let remaining = quantity;
	let reservedTotal = 0;

	for (const row of rows) {
		if (remaining <= 0) break;
		const avail = availableStock(row.onHand, row.reserved);
		if (avail <= 0) continue;

		const take = Math.min(avail, remaining);
		const reservedBefore = row.reserved;
		const reservedAfter = reservedBefore + take;

		await tx
			.update(inventory)
			.set({
				reserved: reservedAfter,
				updatedAt: new Date(),
			})
			.where(eq(inventory.id, row.id));

		await tx.insert(inventoryMovements).values({
			productSkuId,
			locationId: store.id,
			type: 'ONLINE_SALE',
			quantity: take,
			beforeQuantity: reservedBefore,
			afterQuantity: reservedAfter,
			referenceType: 'checkout_pending',
			referenceId: cartId,
			note: '線上結帳庫存預留（reserved）',
			createdBy: userId,
		});

		remaining -= take;
		reservedTotal += take;
	}

	return reservedTotal;
}
