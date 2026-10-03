import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import { orderItems, orders, payments } from '../db/schema';
import type { ShippingAddressSnapshot } from './checkout';
import {
	listPaymentSubmissionsForPayments,
	type PaymentSubmissionView,
} from './payment';

export type OrderItemView = {
	id: string;
	productName: string;
	sku: string;
	unitPrice: number;
	quantity: number;
	subtotal: number;
};

export type PaymentView = {
	id: string;
	method: string;
	amount: number;
	status: string;
	createdAt: Date;
	submissions: PaymentSubmissionView[];
};

export type OrderView = {
	id: string;
	orderNumber: string;
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
	items: OrderItemView[];
	payments: PaymentView[];
};

/**
 * Fetch a single order owned by the user (never leak other customers' orders).
 */
export async function getOrderForUser(
	userId: string,
	orderNumber: string,
): Promise<OrderView | null> {
	const number = String(orderNumber ?? '').trim();
	if (!number) return null;

	const db = getDb();
	const [order] = await db
		.select()
		.from(orders)
		.where(and(eq(orders.orderNumber, number), eq(orders.userId, userId)))
		.limit(1);

	if (!order) return null;

	const items = await db
		.select({
			id: orderItems.id,
			productName: orderItems.productName,
			sku: orderItems.sku,
			unitPrice: orderItems.unitPrice,
			quantity: orderItems.quantity,
			subtotal: orderItems.subtotal,
		})
		.from(orderItems)
		.where(eq(orderItems.orderId, order.id));

	const paymentRows = await db
		.select({
			id: payments.id,
			method: payments.method,
			amount: payments.amount,
			status: payments.status,
			createdAt: payments.createdAt,
		})
		.from(payments)
		.where(eq(payments.orderId, order.id))
		.orderBy(desc(payments.createdAt));

	const submissionsByPayment = await listPaymentSubmissionsForPayments(
		paymentRows.map((p) => p.id),
	);

	return {
		id: order.id,
		orderNumber: order.orderNumber,
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
			...p,
			submissions: submissionsByPayment.get(p.id) ?? [],
		})),
	};
}

export function orderStatusLabel(status: string): string {
	const map: Record<string, string> = {
		PENDING_PAYMENT: '待付款',
		PAYMENT_SUBMITTED: '已回報付款',
		PAID: '已付款',
		PROCESSING: '處理中',
		SHIPPED: '已出貨',
		COMPLETED: '已完成',
		CANCELLED: '已取消',
	};
	return map[status] ?? status;
}

export function paymentStatusLabel(status: string): string {
	const map: Record<string, string> = {
		UNPAID: '待付款',
		PENDING: '待付款',
		AWAITING_VERIFICATION: '待核對',
		PAID: '已確認付款',
		REJECTED: '已駁回',
		CANCELLED: '已取消',
		REFUNDED: '已退款',
	};
	return map[status] ?? status;
}

/** Customer may still submit / resubmit last-five digits. */
export function canSubmitBankLastFive(orderStatus: string): boolean {
	return (
		orderStatus === 'PENDING_PAYMENT' || orderStatus === 'PAYMENT_SUBMITTED'
	);
}

/** Customer may cancel before admin confirms payment. */
export function canCancelOrder(orderStatus: string): boolean {
	return (
		orderStatus === 'PENDING_PAYMENT' || orderStatus === 'PAYMENT_SUBMITTED'
	);
}
