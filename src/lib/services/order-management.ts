import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import {
	inventory,
	inventoryMovements,
	locations,
	orderItems,
	orders,
	orderStatusHistory,
	payments,
} from '../db/schema';
import {
	canCancelOrder,
	getOrderForUser,
	type OrderView,
} from './order';

export type OrderListItem = {
	id: string;
	orderNumber: string;
	status: string;
	paymentStatus: string;
	shippingStatus: string;
	total: number;
	itemCount: number;
	createdAt: Date;
};

export function shippingStatusLabel(status: string): string {
	const map: Record<string, string> = {
		NOT_SHIPPED: '未出貨',
		PREPARING: '備貨中',
		SHIPPED: '已出貨',
		DELIVERED: '已配達',
		CANCELLED: '已取消',
	};
	return map[status] ?? status;
}

/**
 * List orders for the signed-in user only (newest first).
 */
export async function listOrdersForUser(
	userId: string,
): Promise<OrderListItem[]> {
	const db = getDb();

	const rows = await db
		.select({
			id: orders.id,
			orderNumber: orders.orderNumber,
			status: orders.status,
			paymentStatus: orders.paymentStatus,
			shippingStatus: orders.shippingStatus,
			total: orders.total,
			createdAt: orders.createdAt,
			itemCount: sql<number>`coalesce(sum(${orderItems.quantity}), 0)`,
		})
		.from(orders)
		.leftJoin(orderItems, eq(orderItems.orderId, orders.id))
		.where(eq(orders.userId, userId))
		.groupBy(
			orders.id,
			orders.orderNumber,
			orders.status,
			orders.paymentStatus,
			orders.shippingStatus,
			orders.total,
			orders.createdAt,
		)
		.orderBy(desc(orders.createdAt));

	return rows.map((row) => ({
		id: row.id,
		orderNumber: row.orderNumber,
		status: row.status,
		paymentStatus: row.paymentStatus,
		shippingStatus: row.shippingStatus,
		total: row.total,
		itemCount: Number(row.itemCount ?? 0),
		createdAt: row.createdAt,
	}));
}

type Tx = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0];

/**
 * Cancel an unpaid / awaiting-verification order owned by the user.
 * Releases inventory.reserved and records RETURN movements.
 */
export async function cancelOrderForUser(
	userId: string,
	orderNumber: string,
): Promise<OrderView> {
	const number = String(orderNumber ?? '').trim();
	if (!number) {
		throw new Error('缺少訂單編號');
	}

	const db = getDb();

	await db.transaction(async (tx) => {
		const [order] = await tx
			.select()
			.from(orders)
			.where(and(eq(orders.orderNumber, number), eq(orders.userId, userId)))
			.limit(1);

		if (!order) {
			throw new Error('找不到訂單');
		}
		if (!canCancelOrder(order.status)) {
			throw new Error('此訂單狀態無法取消');
		}

		const items = await tx
			.select({
				productSkuId: orderItems.productSkuId,
				quantity: orderItems.quantity,
			})
			.from(orderItems)
			.where(eq(orderItems.orderId, order.id));

		for (const item of items) {
			await releaseSkuReservation(tx, {
				productSkuId: item.productSkuId,
				quantity: item.quantity,
				userId,
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

	const view = await getOrderForUser(userId, number);
	if (!view) {
		throw new Error('取消後無法讀取訂單');
	}
	return view;
}

async function releaseSkuReservation(
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
	if (rows.length === 0) return;

	let remaining = quantity;

	for (const row of rows) {
		if (remaining <= 0) break;
		if (row.reserved <= 0) continue;

		const release = Math.min(row.reserved, remaining);
		const reservedBefore = row.reserved;
		const reservedAfter = reservedBefore - release;

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
			type: 'RETURN',
			quantity: release,
			beforeQuantity: reservedBefore,
			afterQuantity: reservedAfter,
			referenceType: 'order',
			referenceId: orderId,
			note: `取消訂單釋放預留 → ${orderNumber}`,
			createdBy: userId,
		});

		remaining -= release;
	}
}
