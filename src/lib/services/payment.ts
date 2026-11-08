import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { getDb } from '../db/client';
import {
	orders,
	orderStatusHistory,
	paymentSubmissions,
	payments,
	storeSettings,
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

const BANK_SETTING_KEY = 'bank_transfer';
const NOTE_HINT = '轉帳備註請填寫訂單編號，方便對帳。';

/** 環境變數的預設值（後台沒設定過時使用） */
function envBankTransferInfo(): BankTransferInfo {
	return {
		bankName: readPublic('PUBLIC_BANK_NAME') || '（測試）請洽門市確認收款銀行',
		accountName: readPublic('PUBLIC_BANK_ACCOUNT_NAME') || '水博館水族',
		accountNumber: readPublic('PUBLIC_BANK_ACCOUNT_NUMBER') || '請洽門市或 LINE 取得帳號',
		noteHint: NOTE_HINT,
	};
}

/**
 * 顧客看到的匯款資訊：優先用後台「運費設定 → 匯款帳戶」，沒設定或讀取失敗時用環境變數。
 */
export async function getBankTransferInfo(): Promise<BankTransferInfo> {
	const fallback = envBankTransferInfo();
	try {
		const [row] = await getDb().select({ value: storeSettings.value }).from(storeSettings).where(eq(storeSettings.key, BANK_SETTING_KEY)).limit(1);
		const value = (row?.value ?? {}) as Partial<BankTransferInfo>;
		return {
			bankName: value.bankName?.trim() || fallback.bankName,
			accountName: value.accountName?.trim() || fallback.accountName,
			accountNumber: value.accountNumber?.trim() || fallback.accountNumber,
			noteHint: NOTE_HINT,
		};
	} catch (error) {
		console.error('[payment] bank settings unavailable', error);
		return fallback;
	}
}

/** 後台儲存匯款帳戶 */
export async function saveBankTransferInfo(input: { bankName: string; accountName: string; accountNumber: string }, updatedBy: string): Promise<void> {
	const bankName = input.bankName.trim().slice(0, 60);
	const accountName = input.accountName.trim().slice(0, 60);
	const accountNumber = input.accountNumber.trim().slice(0, 40);
	if (!bankName || !accountName || !accountNumber) throw new Error('銀行、戶名、帳號都要填寫');
	if (!/^[\d\s-]+$/.test(accountNumber)) throw new Error('帳號只能包含數字、空白或連字號');
	const value = { bankName, accountName, accountNumber };
	const updatedAt = new Date();
	await getDb().insert(storeSettings).values({ key: BANK_SETTING_KEY, value, updatedBy, updatedAt })
		.onConflictDoUpdate({ target: storeSettings.key, set: { value, updatedBy, updatedAt } });
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
	submissionId?: string;
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
	const submissionId = String(input.submissionId ?? '').trim();
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
			.for('update')
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
		let submission: { id: string } | undefined;
		let existingSubmission: { id: string; verifiedAt: Date | null } | undefined;
		if (submissionId) {
			[existingSubmission] = await tx
				.select()
				.from(paymentSubmissions)
				.where(and(eq(paymentSubmissions.id, submissionId), eq(paymentSubmissions.paymentId, payment.id)))
				.limit(1);
			if (!existingSubmission || existingSubmission.verifiedAt) {
				throw new Error('此轉帳回報目前無法編輯');
			}
		} else {
			// Reuse the pending record when a stale form or browser refresh repeats the POST.
			[existingSubmission] = await tx
				.select({ id: paymentSubmissions.id, verifiedAt: paymentSubmissions.verifiedAt })
				.from(paymentSubmissions)
				.where(and(eq(paymentSubmissions.paymentId, payment.id), isNull(paymentSubmissions.verifiedAt)))
				.orderBy(desc(paymentSubmissions.submittedAt))
				.limit(1);
		}

		if (existingSubmission) {
			[submission] = await tx
				.update(paymentSubmissions)
				.set({ bankLastFive, amount, note, submittedAt: now })
				.where(eq(paymentSubmissions.id, existingSubmission.id))
				.returning();
		} else {
			[submission] = await tx
				.insert(paymentSubmissions)
				.values({
					paymentId: payment.id,
					bankLastFive,
					amount,
					note,
					submittedAt: now,
				})
				.returning();
		}

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
		if (order.status !== 'PAYMENT_SUBMITTED') {
			await tx.insert(orderStatusHistory).values({
				orderId: order.id,
				status: 'PAYMENT_SUBMITTED',
				paymentStatus: 'AWAITING_VERIFICATION',
				shippingStatus: order.shippingStatus,
				createdAt: now,
			});
		}

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
