import { and, asc, desc, eq, gte, ilike, inArray, lt, lte, or, sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import {
	inventory,
	inventoryMovements,
	locations,
	customers,
	orderItems,
	orderStatusHistory,
	orders,
	paymentSubmissions,
	payments,
	productSkus,
	products,
	user,
} from '../db/schema';
import { listInventory, type InventoryRow } from './inventory';
import type { ShippingAddressSnapshot } from './checkout';
import {
	listPaymentSubmissionsForPayments,
	type PaymentSubmissionView,
} from './payment';

export type AdminDashboardStats = {
	todayOrders: number;
	todayRevenue: number;
	pendingPayment: number;
	pendingVerification: number;
	awaitingShipment: number;
	oldestAwaitingShipmentHours: number;
	lowStock: number;
	lowStockItems: InventoryRow[];
	weekRevenue: number;
	weekOrders: number;
	previousWeekRevenue: number;
	previousWeekOrders: number;
};

export type AdminOrderListItem = {
	id: string;
	orderNumber: string;
	status: string;
	paymentStatus: string;
	shippingStatus: string;
	total: number;
	itemCount: number;
	items: Array<{ productName: string; skuName: string | null; quantity: number; unitPrice: number }>;
	itemLineCount: number;
	customerEmail: string | null;
	customerName: string | null;
	createdAt: Date;
};

export type AdminOrderDetail = {
	id: string;
	orderNumber: string;
	userId: string;
	customerEmail: string | null;
	customerEmailVerified: boolean | null;
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
		skuName: string | null;
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

function addDays(date: Date, days: number): Date {
	return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

async function summarizeOrders(start: Date, end: Date) {
	const db = getDb();
	const [row] = await db
		.select({
			orderCount: sql<number>`count(*) filter (where ${orders.status} <> 'CANCELLED')::int`,
			revenue: sql<number>`coalesce(sum(case when ${orders.paymentStatus} = 'PAID' and ${orders.status} <> 'CANCELLED' then ${orders.total} else 0 end), 0)`,
		})
		.from(orders)
		.where(and(gte(orders.createdAt, start), lt(orders.createdAt, end)));
	return {
		orders: Number(row?.orderCount ?? 0),
		revenue: Number(row?.revenue ?? 0),
	};
}

export async function getAdminDashboardStats(): Promise<AdminDashboardStats> {
	const db = getDb();
	const todayStart = startOfTodayTaipei();
	const now = new Date();
	const weekStart = addDays(todayStart, -7);
	const previousWeekStart = addDays(todayStart, -14);
	const [today, [pendingRow], [verificationRow], [shipRow], [oldestShipRow], inventoryRows, week, previousWeek] = await Promise.all([
		summarizeOrders(todayStart, now),
		db
			.select({ count: sql<number>`count(*)::int` })
			.from(orders)
			.where(eq(orders.status, 'PENDING_PAYMENT')),
		db
			.select({ count: sql<number>`count(*)::int` })
			.from(orders)
			.where(eq(orders.status, 'PAYMENT_SUBMITTED')),
		db
			.select({ count: sql<number>`count(*)::int` })
			.from(orders)
			.where(inArray(orders.status, ['PAID', 'PROCESSING'])),
		db
			.select({ hours: sql<number | null>`floor(extract(epoch from (now() - min(${orders.createdAt}))) / 3600)::int` })
			.from(orders)
			.where(inArray(orders.status, ['PAID', 'PROCESSING'])),
		listInventory(),
		summarizeOrders(weekStart, todayStart),
		summarizeOrders(previousWeekStart, weekStart),
	]);
	const lowStockItems = inventoryRows
		.filter((row) => row.isLowStock)
		.sort((a, b) => a.available - b.available || a.productName.localeCompare(b.productName, 'zh-Hant'));
	const oldestAwaitingShipmentHours = Math.max(0, Number(oldestShipRow?.hours ?? 0));

	return {
		todayOrders: today.orders,
		todayRevenue: today.revenue,
		pendingPayment: Number(pendingRow?.count ?? 0),
		pendingVerification: Number(verificationRow?.count ?? 0),
		awaitingShipment: Number(shipRow?.count ?? 0),
		oldestAwaitingShipmentHours,
		lowStock: lowStockItems.length,
		lowStockItems,
		weekRevenue: week.revenue,
		weekOrders: week.orders,
		previousWeekRevenue: previousWeek.revenue,
		previousWeekOrders: previousWeek.orders,
	};
}

export async function getAdminOperationsReport() {
	const db = getDb();
	const now = new Date();
	const todayStart = startOfTodayTaipei();
	const dateParts = new Intl.DateTimeFormat('en-CA', {
		timeZone: 'Asia/Taipei',
		year: 'numeric',
		month: '2-digit',
	}).formatToParts(now);
	const year = dateParts.find((part) => part.type === 'year')?.value ?? String(now.getUTCFullYear());
	const month = dateParts.find((part) => part.type === 'month')?.value ?? '01';
	const monthStart = new Date(`${year}-${month}-01T00:00:00+08:00`);
	const yearStart = new Date(`${year}-01-01T00:00:00+08:00`);
	const weekday = new Intl.DateTimeFormat('en-US', {
		timeZone: 'Asia/Taipei',
		weekday: 'short',
	}).format(now);
	const daysSinceMonday: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
	const weekStart = addDays(todayStart, -(daysSinceMonday[weekday] ?? 0));
	const dailyStart = addDays(todayStart, -13);
	const localDay = sql<string>`to_char(${orders.createdAt} at time zone 'Asia/Taipei', 'YYYY-MM-DD')`;
	const localWeek = sql<string>`to_char(date_trunc('week', ${orders.createdAt} at time zone 'Asia/Taipei'), 'YYYY-MM-DD')`;
	const localMonth = sql<string>`to_char(${orders.createdAt} at time zone 'Asia/Taipei', 'YYYY-MM')`;
	const weeklySeriesStart = addDays(weekStart, -77);
	const monthlySeriesStart = new Date(Date.UTC(Number(year), Number(month) - 12, 1) - 8 * 60 * 60 * 1000);
	const paidSalesFilter = and(
		eq(orders.paymentStatus, 'PAID'),
		sql`${orders.status} <> 'CANCELLED'`,
	);

	const getTopProducts = (start?: Date) => db
		.select({
			productId: orderItems.productId,
			productName: orderItems.productName,
			units: sql<number>`coalesce(sum(${orderItems.quantity}), 0)::int`,
			revenue: sql<number>`coalesce(sum(${orderItems.subtotal}), 0)`,
		})
		.from(orderItems)
		.innerJoin(orders, eq(orderItems.orderId, orders.id))
		.where(and(paidSalesFilter, start ? gte(orders.createdAt, start) : undefined, lt(orders.createdAt, now)))
		.groupBy(orderItems.productId, orderItems.productName)
		.orderBy(desc(sql<number>`sum(${orderItems.quantity})`), desc(sql<number>`sum(${orderItems.subtotal})`))
		.limit(10);

	const [today, week, monthSummary, yearSummary, dailyRows, weeklyRows, monthlyRows, topProductsToday, topProductsWeek, topProductsMonth, topProductsYear, topProductsAll, vipCustomers] = await Promise.all([
		summarizeOrders(todayStart, now),
		summarizeOrders(weekStart, now),
		summarizeOrders(monthStart, now),
		summarizeOrders(yearStart, now),
		db
			.select({
				day: localDay,
				orderCount: sql<number>`count(*) filter (where ${orders.status} <> 'CANCELLED')::int`,
				revenue: sql<number>`coalesce(sum(case when ${orders.paymentStatus} = 'PAID' and ${orders.status} <> 'CANCELLED' then ${orders.total} else 0 end), 0)`,
			})
			.from(orders)
			.where(and(gte(orders.createdAt, dailyStart), lt(orders.createdAt, now)))
			.groupBy(localDay)
			.orderBy(asc(localDay)),
		db
			.select({
				week: localWeek,
				orderCount: sql<number>`count(*) filter (where ${orders.status} <> 'CANCELLED')::int`,
				revenue: sql<number>`coalesce(sum(case when ${orders.paymentStatus} = 'PAID' and ${orders.status} <> 'CANCELLED' then ${orders.total} else 0 end), 0)`,
			})
			.from(orders)
			.where(and(gte(orders.createdAt, weeklySeriesStart), lt(orders.createdAt, now)))
			.groupBy(localWeek)
			.orderBy(asc(localWeek)),
		db
			.select({
				month: localMonth,
				orderCount: sql<number>`count(*) filter (where ${orders.status} <> 'CANCELLED')::int`,
				revenue: sql<number>`coalesce(sum(case when ${orders.paymentStatus} = 'PAID' and ${orders.status} <> 'CANCELLED' then ${orders.total} else 0 end), 0)`,
			})
			.from(orders)
			.where(and(gte(orders.createdAt, monthlySeriesStart), lt(orders.createdAt, now)))
			.groupBy(localMonth)
			.orderBy(asc(localMonth)),
		getTopProducts(todayStart),
		getTopProducts(weekStart),
		getTopProducts(monthStart),
		getTopProducts(yearStart),
		getTopProducts(),
		db
			.select({
				customerId: customers.id,
				userId: customers.userId,
				displayName: customers.displayName,
				accountName: user.name,
				contactEmail: customers.contactEmail,
				accountEmail: user.email,
				orderCount: sql<number>`count(*)::int`,
				revenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
			})
			.from(orders)
			.innerJoin(customers, eq(orders.customerId, customers.id))
			.innerJoin(user, eq(customers.userId, user.id))
			.where(and(eq(orders.paymentStatus, 'PAID'), sql`${orders.status} <> 'CANCELLED'`))
			.groupBy(customers.id, customers.userId, customers.displayName, user.name, customers.contactEmail, user.email)
			.orderBy(desc(sql<number>`sum(${orders.total})`), desc(sql<number>`count(*)`))
			.limit(10),
	]);

	const dailyByDate = new Map(dailyRows.map((row) => [row.day, row]));
	const daily = Array.from({ length: 14 }, (_, index) => {
		const date = addDays(dailyStart, index);
		const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
		const row = dailyByDate.get(day);
		return {
			day,
			orders: Number(row?.orderCount ?? 0),
			revenue: Number(row?.revenue ?? 0),
		};
	});
	const weeklyByDate = new Map(weeklyRows.map((row) => [row.week, row]));
	const weekly = Array.from({ length: 12 }, (_, index) => {
		const date = addDays(weeklySeriesStart, index * 7);
		const week = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
		const row = weeklyByDate.get(week);
		return { week, orders: Number(row?.orderCount ?? 0), revenue: Number(row?.revenue ?? 0) };
	});
	const monthlyByDate = new Map(monthlyRows.map((row) => [row.month, row]));
	const monthly = Array.from({ length: 12 }, (_, index) => {
		const date = new Date(Date.UTC(Number(year), Number(month) - 1 - 11 + index, 1) - 8 * 60 * 60 * 1000);
		const key = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit' }).format(date);
		const row = monthlyByDate.get(key);
		return { month: key, orders: Number(row?.orderCount ?? 0), revenue: Number(row?.revenue ?? 0) };
	});

	return {
		periods: [
			{ key: 'day', label: '今日', start: todayStart, ...today },
			{ key: 'week', label: '本週', start: weekStart, ...week },
			{ key: 'month', label: '本月', start: monthStart, ...monthSummary },
			{ key: 'year', label: '本年', start: yearStart, ...yearSummary },
		],
		daily,
		weekly,
		monthly,
		topProducts: {
			day: topProductsToday.map((row) => ({ ...row, units: Number(row.units), revenue: Number(row.revenue) })),
			week: topProductsWeek.map((row) => ({ ...row, units: Number(row.units), revenue: Number(row.revenue) })),
			month: topProductsMonth.map((row) => ({ ...row, units: Number(row.units), revenue: Number(row.revenue) })),
			year: topProductsYear.map((row) => ({ ...row, units: Number(row.units), revenue: Number(row.revenue) })),
			all: topProductsAll.map((row) => ({ ...row, units: Number(row.units), revenue: Number(row.revenue) })),
		},
		vipCustomers: vipCustomers.map((row) => ({ ...row, orderCount: Number(row.orderCount), revenue: Number(row.revenue) })),
	};
}

export async function listAdminOrders(options?: {
	status?: string;
	userId?: string;
	paymentStatus?: string;
	shippingStatus?: string;
	createdAfter?: Date;
	createdBefore?: Date;
	minTotal?: number;
	maxTotal?: number;
	query?: string;
	limit?: number;
}): Promise<AdminOrderListItem[]> {
	const db = getDb();
	const limit = Math.min(Math.max(options?.limit ?? 100, 1), 300);
	const status = options?.status?.trim() || null;
	const searchTerm = options?.query?.trim();
	const searchPattern = searchTerm ? `%${searchTerm.replace(/[\\%_]/g, '\\$&')}%` : undefined;
	const filters = [
		status === 'PAYMENT_REVIEW'
			? inArray(orders.status, ['PENDING_PAYMENT', 'PAYMENT_SUBMITTED'])
			: status === 'AWAITING_SHIPMENT'
				? inArray(orders.status, ['PAID', 'PROCESSING'])
				: status
					? sql`${orders.status} = ${status}`
					: undefined,
		options?.userId ? eq(orders.userId, options.userId) : undefined,
		options?.paymentStatus ? eq(orders.paymentStatus, options.paymentStatus as typeof orders.paymentStatus.enumValues[number]) : undefined,
		options?.shippingStatus ? eq(orders.shippingStatus, options.shippingStatus as typeof orders.shippingStatus.enumValues[number]) : undefined,
		options?.createdAfter ? gte(orders.createdAt, options.createdAfter) : undefined,
		options?.createdBefore ? lt(orders.createdAt, options.createdBefore) : undefined,
		options?.minTotal !== undefined ? gte(orders.total, options.minTotal) : undefined,
		options?.maxTotal !== undefined ? lte(orders.total, options.maxTotal) : undefined,
		searchPattern
			? or(
				ilike(orders.orderNumber, searchPattern),
				ilike(user.name, searchPattern),
				ilike(user.email, searchPattern),
			)
			: undefined,
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

	const itemRows = rows.length
		? await db
			.select({
				orderId: orderItems.orderId,
				productName: orderItems.productName,
				skuName: orderItems.skuNameSnapshot,
				quantity: orderItems.quantity,
				unitPrice: orderItems.unitPrice,
			})
			.from(orderItems)
			.leftJoin(productSkus, eq(orderItems.productSkuId, productSkus.id))
			.where(inArray(orderItems.orderId, rows.map((row) => row.id)))
			.orderBy(asc(orderItems.productName), asc(orderItems.id))
		: [];
	const itemsByOrder = new Map<string, Array<{ productName: string; skuName: string | null; quantity: number; unitPrice: number }>>();
	for (const item of itemRows) {
		const items = itemsByOrder.get(item.orderId) ?? [];
		items.push({ productName: item.productName, skuName: item.skuName, quantity: item.quantity, unitPrice: item.unitPrice });
		itemsByOrder.set(item.orderId, items);
	}

	return rows.map((row) => {
		const items = itemsByOrder.get(row.id) ?? [];
		return {
			id: row.id,
			orderNumber: row.orderNumber,
			status: row.status,
			paymentStatus: row.paymentStatus,
			shippingStatus: row.shippingStatus,
			total: row.total,
			itemCount: Number(row.itemCount ?? 0),
			items,
			itemLineCount: items.length,
			customerEmail: row.customerEmail,
			customerName: row.customerName,
			createdAt: row.createdAt,
		};
	});
}

export async function getAdminOrderStatusCounts(userId?: string) {
	const db = getDb();
	const rows = await db
		.select({
			status: orders.status,
			count: sql<number>`count(*)::int`,
		})
		.from(orders)
		.where(userId ? eq(orders.userId, userId) : undefined)
		.groupBy(orders.status);
	const counts = new Map(rows.map((row) => [row.status, Number(row.count)]));
	const count = (status: string) => counts.get(status as typeof orders.status.enumValues[number]) ?? 0;

	return {
		all: rows.reduce((total, row) => total + Number(row.count), 0),
		PAYMENT_REVIEW: count('PENDING_PAYMENT') + count('PAYMENT_SUBMITTED'),
		AWAITING_SHIPMENT: count('PAID') + count('PROCESSING'),
		PENDING_PAYMENT: count('PENDING_PAYMENT'),
		PAYMENT_SUBMITTED: count('PAYMENT_SUBMITTED'),
		PROCESSING: count('PROCESSING'),
		SHIPPED: count('SHIPPED'),
		COMPLETED: count('COMPLETED'),
		CANCELLED: count('CANCELLED'),
	};
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
			emailVerified: user.emailVerified,
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
			skuName: orderItems.skuNameSnapshot,
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
		customerEmailVerified: row.emailVerified,
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
