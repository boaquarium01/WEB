import { and, desc, eq, inArray } from 'drizzle-orm';
import { getDb } from '../db/client';
import {
	orders,
	orderStatusHistory,
	paymentSubmissions,
	payments,
} from '../db/schema';

export type BankTransferInfo = {
	bankName: string;
	accountName: string;
	accountNumber: string;
	noteHint: string;
};

export type PaymentSubmissionView = {
	id: string;
	bankLastFive: string;
	amount: number;
	submittedAt: Date;
	verifiedAt: Date | null;
	note: string | null;
};

/**
 * Public bank transfer instructions for customers.
 * Prefer PUBLIC_* env; fall back to V2 test placeholders.
 */
export function getBankTransferInfo(): BankTransferInfo {
	const bankName =
		readPublic('PUBLIC_BANK_NAME') || '（測試）請洽門市確認收款銀行';
	const accountName =
		readPublic('PUBLIC_BANK_ACCOUNT_NAME') || '水博館水族';
	const accountNumber =
		readPublic('PUBLIC_BANK_ACCOUNT_NUMBER') || '請洽門市或 LINE 取得帳號';

	return {
		bankName,
		accountName,
		accountNumber,
		noteHint: '轉帳備註請填寫訂單編號，方便對帳。',
	};
}

function readPublic(key: string): string {
	const fromProcess = process.env[key];
	if (fromProcess && fromProcess.trim()) return fromProcess.trim();
	try {
		const meta = (import.meta as ImportMeta & { env?: Record<string, string> })
			.env?.[key];
		if (typeof meta === 'string' && meta.trim()) return meta.trim();
	} catch {
		/* ignore */
	}
	return '';
}

export type SubmitBankLastFiveInput = {
	orderNumber: string;
	bankLastFive: string;
	/** Amount customer claims to have transferred; defaults to order.total */
	amount?: number;
	note?: string;
};

/**
 * Customer submits bank-transfer last-five digits.
 * Does NOT mark the order as PAID (admin verification is later).
 */
export async function submitBankTransferLastFive(
	userId: string,
	input: SubmitBankLastFiveInput,
): Promise<{ orderNumber: string; submissionId: string }> {
	const orderNumber = String(input.orderNumber ?? '').trim();
	const bankLastFive = String(input.bankLastFive ?? '').trim();
	const note = String(input.note ?? '').trim() || null;

	if (!orderNumber) {
		throw new Error('缺少訂單編號');
	}
	if (!/^\d{5}$/.test(bankLastFive)) {
		throw new Error('請輸入正確的轉帳帳號末五碼（5 位數字）');
	}

	const db = getDb();

	return db.transaction(async (tx) => {
		const [order] = await tx
			.select()
			.from(orders)
			.where(
				and(eq(orders.orderNumber, orderNumber), eq(orders.userId, userId)),
			)
			.limit(1);

		if (!order) {
			throw new Error('找不到訂單');
		}

		const allowedStatuses = ['PENDING_PAYMENT', 'PAYMENT_SUBMITTED'] as const;
		if (!allowedStatuses.includes(order.status as (typeof allowedStatuses)[number])) {
			throw new Error('此訂單目前無法回報付款');
		}

		const [payment] = await tx
			.select()
			.from(payments)
			.where(
				and(
					eq(payments.orderId, order.id),
					eq(payments.method, 'BANK_TRANSFER'),
				),
			)
			.orderBy(desc(payments.createdAt))
			.limit(1);

		if (!payment) {
			throw new Error('找不到付款紀錄');
		}
		if (payment.status === 'PAID' || payment.status === 'CANCELLED') {
			throw new Error('此付款狀態無法再回報末五碼');
		}

		const amount =
			input.amount !== undefined && input.amount !== null
				? Number(input.amount)
				: order.total;

		if (!Number.isInteger(amount) || amount < 1) {
			throw new Error('轉帳金額無效');
		}

		const now = new Date();
		const [submission] = await tx
			.insert(paymentSubmissions)
			.values({
				paymentId: payment.id,
				bankLastFive,
				amount,
				note,
				submittedAt: now,
			})
			.returning();

		if (!submission) {
			throw new Error('無法建立付款回報');
		}

		await tx
			.update(payments)
			.set({
				status: 'AWAITING_VERIFICATION',
			})
			.where(eq(payments.id, payment.id));

		await tx
			.update(orders)
			.set({
				status: 'PAYMENT_SUBMITTED',
				paymentStatus: 'AWAITING_VERIFICATION',
				updatedAt: now,
			})
			.where(eq(orders.id, order.id));
		await tx.insert(orderStatusHistory).values({
			orderId: order.id,
			status: 'PAYMENT_SUBMITTED',
			paymentStatus: 'AWAITING_VERIFICATION',
			shippingStatus: order.shippingStatus,
			createdAt: now,
		});

		return {
			orderNumber: order.orderNumber,
			submissionId: submission.id,
		};
	});
}

export async function listPaymentSubmissionsForPayment(
	paymentId: string,
): Promise<PaymentSubmissionView[]> {
	const db = getDb();
	const rows = await db
		.select({
			id: paymentSubmissions.id,
			bankLastFive: paymentSubmissions.bankLastFive,
			amount: paymentSubmissions.amount,
			submittedAt: paymentSubmissions.submittedAt,
			verifiedAt: paymentSubmissions.verifiedAt,
			note: paymentSubmissions.note,
		})
		.from(paymentSubmissions)
		.where(eq(paymentSubmissions.paymentId, paymentId))
		.orderBy(desc(paymentSubmissions.submittedAt));

	return rows;
}

/** Load submissions for multiple payment ids (order detail). */
export async function listPaymentSubmissionsForPayments(
	paymentIds: string[],
): Promise<Map<string, PaymentSubmissionView[]>> {
	const map = new Map<string, PaymentSubmissionView[]>();
	if (paymentIds.length === 0) return map;

	const db = getDb();
	const rows = await db
		.select({
			id: paymentSubmissions.id,
			paymentId: paymentSubmissions.paymentId,
			bankLastFive: paymentSubmissions.bankLastFive,
			amount: paymentSubmissions.amount,
			submittedAt: paymentSubmissions.submittedAt,
			verifiedAt: paymentSubmissions.verifiedAt,
			note: paymentSubmissions.note,
		})
		.from(paymentSubmissions)
		.where(inArray(paymentSubmissions.paymentId, paymentIds))
		.orderBy(desc(paymentSubmissions.submittedAt));

	for (const row of rows) {
		const list = map.get(row.paymentId) ?? [];
		list.push({
			id: row.id,
			bankLastFive: row.bankLastFive,
			amount: row.amount,
			submittedAt: row.submittedAt,
			verifiedAt: row.verifiedAt,
			note: row.note,
		});
		map.set(row.paymentId, list);
	}
	return map;
}
