import { and, desc, eq, ilike, ne, or } from 'drizzle-orm';
import { getDb } from '../db/client';
import { addresses, customers, user } from '../db/schema';
import { listAdminOrders } from './admin-orders';

export async function listAdminMembers(query = '') {
	const db = getDb();
	const term = query.trim();
	const rows = await db
		.select({
			userId: user.id,
			name: user.name,
			email: user.email,
			emailVerified: user.emailVerified,
			createdAt: user.createdAt,
			phone: customers.phone,
		})
		.from(user)
		.leftJoin(customers, eq(customers.userId, user.id))
		.where(term ? or(ilike(user.name, `%${term}%`), ilike(user.email, `%${term}%`), ilike(customers.phone, `%${term}%`)) : undefined)
		.orderBy(desc(user.createdAt))
		.limit(500);
	return rows;
}

export async function getAdminMember(userId: string) {
	const db = getDb();
	const [member] = await db
		.select({
			userId: user.id,
			name: user.name,
			email: user.email,
			emailVerified: user.emailVerified,
			createdAt: user.createdAt,
			updatedAt: user.updatedAt,
			customerId: customers.id,
			displayName: customers.displayName,
			phone: customers.phone,
			bankAccountLastFive: customers.bankAccountLastFive,
			note: customers.note,
			customerCreatedAt: customers.createdAt,
			customerUpdatedAt: customers.updatedAt,
		})
		.from(user)
		.leftJoin(customers, eq(customers.userId, user.id))
		.where(eq(user.id, userId))
		.limit(1);
	if (!member) return null;

	const memberAddresses = member.customerId
		? await db.select().from(addresses)
			.where(eq(addresses.customerId, member.customerId))
			.orderBy(desc(addresses.isDefault), desc(addresses.createdAt))
		: [];
	const orders = await listAdminOrders({ userId, limit: 300 });
	return { ...member, addresses: memberAddresses, orders };
}

export async function updateAdminMember(input: {
	userId: string;
	name: string;
	email: string;
	displayName: string;
	phone: string;
	bankAccountLastFive: string;
	note: string;
}) {
	const name = input.name.trim();
	const email = input.email.trim().toLowerCase();
	const phone = input.phone.trim();
	const bankAccountLastFive = input.bankAccountLastFive.trim();
	const note = input.note.trim();
	if (!name || name.length > 120) throw new Error('姓名不可空白，且需在 120 字內');
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('請輸入有效的電子郵件');
	if (phone.length > 40) throw new Error('手機號碼不可超過 40 字');
	if (bankAccountLastFive && !/^\d{5}$/.test(bankAccountLastFive)) throw new Error('常用轉帳帳號末五碼請輸入 5 位數字');
	if (note.length > 2000) throw new Error('會員備註不可超過 2000 字');

	const db = getDb();
	await db.transaction(async (tx) => {
		const [existing] = await tx.select({ id: user.id }).from(user).where(eq(user.id, input.userId)).limit(1);
		if (!existing) throw new Error('找不到此會員');
		const [emailOwner] = await tx.select({ id: user.id }).from(user).where(and(eq(user.email, email), ne(user.id, input.userId))).limit(1);
		if (emailOwner) throw new Error('此電子郵件已由其他帳號使用');

		const [oldUser] = await tx.select({ email: user.email }).from(user).where(eq(user.id, input.userId)).limit(1);
		await tx.update(user).set({ name, email, emailVerified: oldUser?.email === email, updatedAt: new Date() }).where(eq(user.id, input.userId));
		await tx.insert(customers).values({ userId: input.userId }).onConflictDoNothing({ target: customers.userId });
		await tx.update(customers).set({
			displayName: input.displayName.trim() || null,
			phone: phone || null,
			bankAccountLastFive: bankAccountLastFive || null,
			note: note || null,
			updatedAt: new Date(),
		}).where(eq(customers.userId, input.userId));
	});
}

export async function saveAdminMemberAddress(input: {
	userId: string;
	addressId?: string;
	label: string;
	recipientName: string;
	phone: string;
	postalCode: string;
	city: string;
	district: string;
	addressLine: string;
	isDefault: boolean;
}) {
	const values = {
		label: input.label.trim() || null,
		recipientName: input.recipientName.trim(),
		phone: input.phone.trim(),
		postalCode: input.postalCode.trim(),
		city: input.city.trim(),
		district: input.district.trim(),
		addressLine: input.addressLine.trim(),
		isDefault: input.isDefault,
	};
	if ([values.recipientName, values.phone, values.postalCode, values.city, values.district, values.addressLine].some((value) => !value)) {
		throw new Error('收件人、電話與完整地址欄位都必須填寫');
	}
	if (values.phone.length > 40 || values.addressLine.length > 500) throw new Error('電話或地址長度超出限制');

	const db = getDb();
	await db.transaction(async (tx) => {
		const [customer] = await tx.select({ id: customers.id }).from(customers).where(eq(customers.userId, input.userId)).limit(1);
		if (!customer) throw new Error('會員資料不存在，請先儲存會員資料');
		if (input.isDefault) {
			await tx.update(addresses).set({ isDefault: false, updatedAt: new Date() }).where(eq(addresses.customerId, customer.id));
		}
		if (input.addressId) {
			const [updated] = await tx.update(addresses).set({ ...values, updatedAt: new Date() })
				.where(and(eq(addresses.id, input.addressId), eq(addresses.customerId, customer.id))).returning({ id: addresses.id });
			if (!updated) throw new Error('找不到此會員的收件地址');
		} else {
			await tx.insert(addresses).values({ ...values, customerId: customer.id });
		}
	});
}
