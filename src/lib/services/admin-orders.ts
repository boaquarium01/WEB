import { and, asc, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import {
	inventory,
	inventoryMovements,
	locations,
	orderItems,
	orderStatusHistory,
	orders,
	paymentSubmissions,
	payments,
	productSkus,
	products,
	user,
} from '../db/schema';
import { countLowStock } from './inventory';
import type { ShippingAddressSnapshot } from './checkout';
import {
	listPaymentSubmissionsForPayments,
	type PaymentSubmissionView,
} from './payment';

export type AdminDashboardStats = {
	todayOrders: number;
	pendingPayment: number;
	awaitingShipment: number;
	lowStock: number;
};

export type AdminOrderListItem = {
	id: string;
	orderNumber: string;
	status: string;
	paymentStatus: string;
	shippingStatus: string;
	total: number;
	itemCount: number;
	customerEmail: string | null;
	customerName: string | null;
	createdAt: Date;
};

export type AdminOrderDetail = {
	id: string;
	orderNumber: string;
	userId: string;
	customerEmail: string | null;
	customerName: string | null;
	status: string;
	paymentStatus: string;
	shippingStatus: string;
	subtotal: number;
	shippingFee: number;
	discount: number;
	total: number;
	note: string | null;
	shippingAddress: ShippingAddressSnapshot;
	createdAt: Date;
	items: Array<{
		id: string;
		productName: string;
		sku: string;
		unitPrice: number;
		quantity: number;
		subtotal: number;
		productSkuId: string;
	}>;
	payments: Array<{
		id: string;
		method: string;
		amount: number;
		status: string;
		paidAt: Date | null;
		createdAt: Date;
		submissions: PaymentSubmissionView[];
	}>;
	statusHistory: Array<{
		status: string;
		paymentStatus: string;
		shippingStatus: string;
		createdAt: Date;
	}>;
};

type Tx = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0];

function startOfTodayTaipei(): Date {
	const formatter = new Intl.DateTimeFormat('en-CA', {
		timeZone: 'Asia/Taipei',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	});
	const day = formatter.format(new Date()); // YYYY-MM-DD
	// Treat as Taipei midnight expressed in UTC via offset +08:00
	return new Date(`${day}T00:00:00+08:00`);
}

export async function getAdminDashboardStats(): Promise<AdminDashboardStats> {
	const db = getDb();
	const todayStart = startOfTodayTaipei();

	const [todayRow] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(orders)
		.where(gte(orders.createdAt, todayStart));

	const [pendingRow] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(orders)
		.where(
			inArray(orders.status, ['PENDING_PAYMENT', 'PAYMENT_SUBMITTED']),
		);

	const [shipRow] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(orders)
		.where(inArray(orders.status, ['PAID', 'PROCESSING']));

	const lowStock = await countLowStock();

	return {
		todayOrders: Number(todayRow?.count ?? 0),
		pendingPayment: Number(pendingRow?.count ?? 0),
		awaitingShipment: Number(shipRow?.count ?? 0),
		lowStock,
	};
}

export async function listAdminOrders(options?: {
	status?: string;
	userId?: string;
	limit?: number;
}): Promise<AdminOrderListItem[]> {
	const db = getDb();
	const limit = Math.min(Math.max(options?.limit ?? 100, 1), 300);
	const status = options?.status?.trim() || null;
	const filters = [
		status === 'PAYMENT_REVIEW'
			? inArray(orders.status, ['PENDING_PAYMENT', 'PAYMENT_SUBMITTED'])
			: status === 'AWAITING_SHIPMENT'
				? inArray(orders.status, ['PAID', 'PROCESSING'])
				: status
					? sql`${orders.status} = ${status}`
					: undefined,
		options?.userId ? eq(orders.userId, options.userId) : undefined,
	].filter((value) => value !== undefined);
	const rows = await db
		.select({
			id: orders.id,
			orderNumber: orders.orderNumber,
			status: orders.status,
			paymentStatus: orders.paymentStatus,
			shippingStatus: orders.shippingStatus,
			total: orders.total,
			createdAt: orders.createdAt,
			customerEmail: user.email,
			customerName: user.name,
			itemCount: sql<number>`coalesce(sum(${orderItems.quantity}), 0)`,
		})
		.from(orders)
		.leftJoin(user, eq(orders.userId, user.id))
		.leftJoin(orderItems, eq(orderItems.orderId, orders.id))
		.where(filters.length ? and(...filters) : undefined)
		.groupBy(
			orders.id,
			orders.orderNumber,
			orders.status,
			orders.paymentStatus,
			orders.shippingStatus,
			orders.total,
			orders.createdAt,
			user.email,
			user.name,
		)
		.orderBy(desc(orders.createdAt))
		.limit(limit);

	return rows.map((row) => ({
		id: row.id,
		orderNumber: row.orderNumber,
		status: row.status,
		paymentStatus: row.paymentStatus,
		shippingStatus: row.shippingStatus,
		total: row.total,
		itemCount: Number(row.itemCount ?? 0),
		customerEmail: row.customerEmail,
		customerName: row.customerName,
		createdAt: row.createdAt,
	}));
}

export async function getAdminOrder(
	orderNumber: string,
): Promise<AdminOrderDetail | null> {
	const number = String(orderNumber ?? '').trim();
	if (!number) return null;

	const db = getDb();
	const [row] = await db
		.select({
			order: orders,
			email: user.email,
			name: user.name,
		})
		.from(orders)
		.leftJoin(user, eq(orders.userId, user.id))
		.where(eq(orders.orderNumber, number))
		.limit(1);

	if (!row) return null;
	const order = row.order;

	const items = await db
		.select({
			id: orderItems.id,
			productName: orderItems.productName,
			sku: orderItems.sku,
			unitPrice: orderItems.unitPrice,
			quantity: orderItems.quantity,
			subtotal: orderItems.subtotal,
			productSkuId: orderItems.productSkuId,
		})
		.from(orderItems)
		.where(eq(orderItems.orderId, order.id));

	const paymentRows = await db
		.select()
		.from(payments)
		.where(eq(payments.orderId, order.id))
		.orderBy(desc(payments.createdAt));
	const statusHistory = await db
		.select({
			status: orderStatusHistory.status,
			paymentStatus: orderStatusHistory.paymentStatus,
			shippingStatus: orderStatusHistory.shippingStatus,
			createdAt: orderStatusHistory.createdAt,
		})
		.from(orderStatusHistory)
		.where(eq(orderStatusHistory.orderId, order.id))
		.orderBy(asc(orderStatusHistory.createdAt));

	const submissionsByPayment = await listPaymentSubmissionsForPayments(
		paymentRows.map((p) => p.id),
	);

	return {
		id: order.id,
		orderNumber: order.orderNumber,
		userId: order.userId,
		customerEmail: row.email,
		customerName: row.name,
		status: order.status,
		paymentStatus: order.paymentStatus,
		shippingStatus: order.shippingStatus,
		subtotal: order.subtotal,
		shippingFee: order.shippingFee,
		discount: order.discount,
		total: order.total,
		note: order.note,
		shippingAddress: order.shippingAddress as ShippingAddressSnapshot,
		createdAt: order.createdAt,
		items,
		payments: paymentRows.map((p) => ({
			id: p.id,
			method: p.method,
			amount: p.amount,
			status: p.status,
			paidAt: p.paidAt,
			createdAt: p.createdAt,
			submissions: submissionsByPayment.get(p.id) ?? [],
		})),
		statusHistory,
	};
}

/**
 * Confirm bank transfer → PAID + PROCESSING.
 */
export async function adminConfirmPayment(
	orderNumber: string,
	adminUserId: string,
	submissionId?: string,
): Promise<void> {
	const db = getDb();
	await db.transaction(async (tx) => {
		const order = await lockOrder(tx, orderNumber);
		if (
			order.status !== 'PENDING_PAYMENT' &&
			order.status !== 'PAYMENT_SUBMITTED'
		) {
			throw new Error('此訂單狀態無法確認付款');
		}

		const [payment] = await tx
			.select()
			.from(payments)
			.where(eq(payments.orderId, order.id))
			.orderBy(desc(payments.createdAt))
			.limit(1);

		if (!payment) {
			throw new Error('找不到付款紀錄');
		}

		const now = new Date();

		if (submissionId) {
			const [sub] = await tx
				.select()
				.from(paymentSubmissions)
				.where(
					and(
						eq(paymentSubmissions.id, submissionId),
						eq(paymentSubmissions.paymentId, payment.id),
					),
				)
				.limit(1);
			if (!sub) {
				throw new Error('找不到付款回報');
			}
			await tx
				.update(paymentSubmissions)
				.set({
					verifiedAt: now,
					verifiedBy: adminUserId,
				})
				.where(eq(paymentSubmissions.id, sub.id));
		} else {
			// Verify latest unverified submission if any
			const [latest] = await tx
				.select()
				.from(paymentSubmissions)
				.where(eq(paymentSubmissions.paymentId, payment.id))
				.orderBy(desc(paymentSubmissions.submittedAt))
				.limit(1);
			if (latest && !latest.verifiedAt) {
				await tx
					.update(paymentSubmissions)
					.set({
						verifiedAt: now,
						verifiedBy: adminUserId,
					})
					.where(eq(paymentSubmissions.id, latest.id));
			}
		}

		await tx
			.update(payments)
			.set({
				status: 'PAID',
				paidAt: now,
			})
			.where(eq(payments.id, payment.id));

		await tx
			.update(orders)
			.set({
				status: 'PROCESSING',
				paymentStatus: 'PAID',
				shippingStatus: 'PREPARING',
				updatedAt: now,
			})
			.where(eq(orders.id, order.id));
		await tx.insert(orderStatusHistory).values({ orderId: order.id, status: 'PROCESSING', paymentStatus: 'PAID', shippingStatus: 'PREPARING', createdAt: now });
	});
}

/**
 * Mark shipped: deduct on_hand + reserved, movement ONLINE_SALE.
 */
export async function adminMarkShipped(
	orderNumber: string,
	adminUserId: string,
): Promise<void> {
	const db = getDb();
	await db.transaction(async (tx) => {
		const order = await lockOrder(tx, orderNumber);
		if (order.status !== 'PROCESSING' && order.status !== 'PAID') {
			throw new Error('此訂單狀態無法標記出貨');
		}

		const items = await tx
			.select({
				productSkuId: orderItems.productSkuId,
				quantity: orderItems.quantity,
			})
			.from(orderItems)
			.where(eq(orderItems.orderId, order.id));

		for (const item of items) {
			await fulfillSkuStock(tx, {
				productSkuId: item.productSkuId,
				quantity: item.quantity,
				userId: adminUserId,
				orderId: order.id,
				orderNumber: order.orderNumber,
			});
		}

		const now = new Date();
		await tx
			.update(orders)
			.set({
				status: 'SHIPPED',
				shippingStatus: 'SHIPPED',
				updatedAt: now,
			})
			.where(eq(orders.id, order.id));
		await tx.insert(orderStatusHistory).values({ orderId: order.id, status: 'SHIPPED', paymentStatus: order.paymentStatus, shippingStatus: 'SHIPPED', createdAt: now });
	});
}

export async function adminCompleteOrder(orderNumber: string): Promise<void> {
	const db = getDb();
	await db.transaction(async (tx) => {
		const order = await lockOrder(tx, orderNumber);
		if (order.status !== 'SHIPPED') {
			throw new Error('僅已出貨訂單可標記完成');
		}
		const now = new Date();
		await tx
			.update(orders)
			.set({
				status: 'COMPLETED',
				shippingStatus: 'DELIVERED',
				updatedAt: now,
			})
			.where(eq(orders.id, order.id));
		await tx.insert(orderStatusHistory).values({ orderId: order.id, status: 'COMPLETED', paymentStatus: order.paymentStatus, shippingStatus: 'DELIVERED', createdAt: now });
	});
}

/**
 * Admin cancel before shipment; releases reserved stock.
 */
export async function adminCancelOrder(
	orderNumber: string,
	adminUserId: string,
): Promise<void> {
	const db = getDb();
	await db.transaction(async (tx) => {
		const order = await lockOrder(tx, orderNumber);
		const cancellable = [
			'PENDING_PAYMENT',
			'PAYMENT_SUBMITTED',
			'PAID',
			'PROCESSING',
		];
		if (!cancellable.includes(order.status)) {
			throw new Error('此訂單狀態無法取消（已出貨請走退貨流程）');
		}

		const items = await tx
			.select({
				productSkuId: orderItems.productSkuId,
				quantity: orderItems.quantity,
			})
			.from(orderItems)
			.where(eq(orderItems.orderId, order.id));

		for (const item of items) {
			await releaseReservedOnly(tx, {
				productSkuId: item.productSkuId,
				quantity: item.quantity,
				userId: adminUserId,
				orderId: order.id,
				orderNumber: order.orderNumber,
			});
		}

		await tx
			.update(payments)
			.set({ status: 'CANCELLED' })
			.where(eq(payments.orderId, order.id));

		const now = new Date();
		await tx
			.update(orders)
			.set({
				status: 'CANCELLED',
				paymentStatus: 'CANCELLED',
				shippingStatus: 'CANCELLED',
				updatedAt: now,
			})
			.where(eq(orders.id, order.id));
		await tx.insert(orderStatusHistory).values({ orderId: order.id, status: 'CANCELLED', paymentStatus: 'CANCELLED', shippingStatus: 'CANCELLED', createdAt: now });
	});
}

export type AdminProductRow = {
	id: string;
	name: string;
	slug: string;
	productType: string;
	sellingPrice: number;
	isActive: boolean;
	isOnline: boolean;
	skuCount: number;
	updatedAt: Date;
};

export async function listAdminProducts(): Promise<AdminProductRow[]> {
	const db = getDb();
	const rows = await db
		.select({
			id: products.id,
			name: products.name,
			slug: products.slug,
			productType: products.productType,
			sellingPrice: products.sellingPrice,
			isActive: products.isActive,
			isOnline: products.isOnline,
			updatedAt: products.updatedAt,
			skuCount: sql<number>`count(${productSkus.id})::int`,
		})
		.from(products)
		.leftJoin(productSkus, eq(productSkus.productId, products.id))
		.groupBy(
			products.id,
			products.name,
			products.slug,
			products.productType,
			products.sellingPrice,
			products.isActive,
			products.isOnline,
			products.updatedAt,
		)
		.orderBy(asc(products.name));

	return rows.map((r) => ({
		...r,
		skuCount: Number(r.skuCount ?? 0),
	}));
}

async function lockOrder(tx: Tx, orderNumber: string) {
	const number = String(orderNumber ?? '').trim();
	const [order] = await tx
		.select()
		.from(orders)
		.where(eq(orders.orderNumber, number))
		.for('update')
		.limit(1);
	if (!order) {
		throw new Error('找不到訂單');
	}
	return order;
}

async function releaseReservedOnly(
	tx: Tx,
	args: {
		productSkuId: string;
		quantity: number;
		userId: string;
		orderId: string;
		orderNumber: string;
	},
): Promise<void> {
	const { productSkuId, quantity, userId, orderId, orderNumber } = args;
	const store = await getStore(tx);
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

	let remaining = quantity;
	for (const row of rows) {
		if (remaining <= 0) break;
		if (row.reserved <= 0) continue;
		const release = Math.min(row.reserved, remaining);
		const before = row.reserved;
		const after = before - release;
		await tx
			.update(inventory)
			.set({ reserved: after, updatedAt: new Date() })
			.where(eq(inventory.id, row.id));
		await tx.insert(inventoryMovements).values({
			productSkuId,
			locationId: store.id,
			type: 'RETURN',
			quantity: release,
			beforeQuantity: before,
			afterQuantity: after,
			referenceType: 'order',
			referenceId: orderId,
			note: `後台取消訂單釋放預留 → ${orderNumber}`,
			createdBy: userId,
		});
		remaining -= release;
	}
}

/** Deduct onHand and reserved on shipment. */
async function fulfillSkuStock(
	tx: Tx,
	args: {
		productSkuId: string;
		quantity: number;
		userId: string;
		orderId: string;
		orderNumber: string;
	},
): Promise<void> {
	const { productSkuId, quantity, userId, orderId, orderNumber } = args;
	const store = await getStore(tx);
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
		return;
	}
	if (rows.some((row) => row.onHand < 0)) {
		let release = quantity;
		for (const row of rows) {
			if (release <= 0) break;
			const take = Math.min(row.reserved, release);
			if (take <= 0) continue;
			await tx
				.update(inventory)
				.set({ reserved: row.reserved - take, updatedAt: new Date() })
				.where(eq(inventory.id, row.id));
			release -= take;
		}
		return;
	}

	let remaining = quantity;
	for (const row of rows) {
		if (remaining <= 0) break;
		const take = Math.min(remaining, row.onHand);
		if (take <= 0) continue;

		const onHandBefore = row.onHand;
		const onHandAfter = onHandBefore - take;
		const reservedAfter = Math.max(0, row.reserved - take);

		if (onHandAfter < reservedAfter) {
			throw new Error(
				`出貨失敗：SKU 庫存不足以扣減（在庫 ${onHandBefore}／預留 ${row.reserved}）`,
			);
		}

		await tx
			.update(inventory)
			.set({
				onHand: onHandAfter,
				reserved: reservedAfter,
				updatedAt: new Date(),
			})
			.where(eq(inventory.id, row.id));

		await tx.insert(inventoryMovements).values({
			productSkuId,
			locationId: store.id,
			type: 'ONLINE_SALE',
			quantity: take,
			beforeQuantity: onHandBefore,
			afterQuantity: onHandAfter,
			referenceType: 'order',
			referenceId: orderId,
			note: `出貨扣庫存 → ${orderNumber}`,
			createdBy: userId,
		});

		remaining -= take;
	}

	if (remaining > 0) {
		throw new Error(`出貨失敗：庫存不足（尚缺 ${remaining}）`);
	}
}

async function getStore(tx: Tx) {
	const [store] = await tx
		.select()
		.from(locations)
		.where(and(eq(locations.type, 'STORE'), eq(locations.isActive, true)))
		.orderBy(asc(locations.createdAt))
		.limit(1);
	if (!store) {
		throw new Error('尚未設定 STORE 庫存地點');
	}
	return store;
}
