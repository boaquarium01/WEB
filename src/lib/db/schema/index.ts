import { randomUUID } from 'node:crypto';
import {
	bigint,
	boolean,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
	index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ─── Enums（含未來 POS / ERP 預留值；目前不實作對應功能）───

export const locationTypeEnum = pgEnum('location_type', [
	'STORE',
	'WAREHOUSE',
	'BRANCH',
]);

export const inventoryMovementTypeEnum = pgEnum('inventory_movement_type', [
	'ONLINE_SALE',
	'RETURN',
	'DAMAGE',
	'DEATH',
	'ADJUSTMENT',
	// Future (reserved, not implemented in Phase 1)
	'PURCHASE',
	'POS_SALE',
	'TRANSFER_IN',
	'TRANSFER_OUT',
]);

export const cartStatusEnum = pgEnum('cart_status', [
	'ACTIVE',
	'CHECKED_OUT',
	'ABANDONED',
]);

export const orderStatusEnum = pgEnum('order_status', [
	'PENDING_PAYMENT',
	'PAYMENT_SUBMITTED',
	'PAID',
	'PROCESSING',
	'SHIPPED',
	'COMPLETED',
	'CANCELLED',
]);

export const orderPaymentStatusEnum = pgEnum('order_payment_status', [
	'UNPAID',
	'AWAITING_VERIFICATION',
	'PAID',
	'REFUNDED',
	'CANCELLED',
]);

export const shippingStatusEnum = pgEnum('shipping_status', [
	'NOT_SHIPPED',
	'PREPARING',
	'SHIPPED',
	'DELIVERED',
	'CANCELLED',
]);

export const paymentMethodEnum = pgEnum('payment_method', [
	'BANK_TRANSFER',
	// Future: CREDIT_CARD, LINE_PAY — not implemented
]);

export const paymentStatusEnum = pgEnum('payment_status', [
	'PENDING',
	'AWAITING_VERIFICATION',
	'PAID',
	'REJECTED',
	'CANCELLED',
	'REFUNDED',
]);

// ─── Better Auth（table names follow Better Auth defaults）───

export const user = pgTable('user', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull().unique(),
	emailVerified: boolean('email_verified').notNull().default(false),
	image: text('image'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable(
	'session',
	{
		id: text('id').primaryKey(),
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
		token: text('token').notNull().unique(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
		ipAddress: text('ip_address'),
		userAgent: text('user_agent'),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
	},
	(t) => [index('session_user_id_idx').on(t.userId)],
);

export const account = pgTable(
	'account',
	{
		id: text('id').primaryKey(),
		accountId: text('account_id').notNull(),
		providerId: text('provider_id').notNull(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		accessToken: text('access_token'),
		refreshToken: text('refresh_token'),
		idToken: text('id_token'),
		accessTokenExpiresAt: timestamp('access_token_expires_at', {
			withTimezone: true,
		}),
		refreshTokenExpiresAt: timestamp('refresh_token_expires_at', {
			withTimezone: true,
		}),
		scope: text('scope'),
		password: text('password'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [index('account_user_id_idx').on(t.userId), uniqueIndex('account_provider_account_uidx').on(t.providerId, t.accountId)],
);

export const verification = pgTable('verification', {
	id: text('id').primaryKey(),
	identifier: text('identifier').notNull(),
	value: text('value').notNull(),
	expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

/** Better Auth's shared rate-limit storage for serverless deployments. */
export const rateLimit = pgTable('rate_limit', {
	id: text('id').primaryKey().$defaultFn(() => randomUUID()),
	key: text('key').notNull().unique(),
	count: integer('count').notNull(),
	lastRequest: bigint('last_request', { mode: 'number' }).notNull(),
});

// ─── Customer ───

export const customers = pgTable(
	'customers',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		displayName: text('display_name'),
		phone: text('phone'),
		contactEmail: text('contact_email'),
		bankAccountLastFive: text('bank_account_last_five'),
		note: text('note'),
		termsAcceptedAt: timestamp('terms_accepted_at', { withTimezone: true }),
		onboardingCompleted: boolean('onboarding_completed').notNull().default(true),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [uniqueIndex('customers_user_id_uidx').on(t.userId)],
);

export const addresses = pgTable(
	'addresses',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		customerId: uuid('customer_id')
			.notNull()
			.references(() => customers.id, { onDelete: 'cascade' }),
		label: text('label'),
		recipientName: text('recipient_name').notNull(),
		phone: text('phone').notNull(),
		postalCode: text('postal_code').notNull(),
		city: text('city').notNull(),
		district: text('district').notNull(),
		addressLine: text('address_line').notNull(),
		isDefault: boolean('is_default').notNull().default(false),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [index('addresses_customer_id_idx').on(t.customerId)],
);

// ─── Product ───

export const products = pgTable(
	'products',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		sanityProductId: text('sanity_product_id').notNull(),
		name: text('name').notNull(),
		slug: text('slug').notNull(),
		productType: text('product_type').notNull(),
		/** Selling price in TWD (integer dollars). Server is source of truth. */
		sellingPrice: integer('selling_price').notNull(),
		unit: text('unit').notNull().default('pcs'),
		isActive: boolean('is_active').notNull().default(true),
		isOnline: boolean('is_online').notNull().default(true),
		/** Live goods (fish/shrimp/plants) may require manual confirmation later. */
		requiresManualConfirmation: boolean('requires_manual_confirmation')
			.notNull()
			.default(false),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [
		uniqueIndex('products_sanity_product_id_uidx').on(t.sanityProductId),
		uniqueIndex('products_slug_uidx').on(t.slug),
		index('products_is_online_idx').on(t.isOnline),
	],
);

export const productSkus = pgTable(
	'product_skus',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		productId: uuid('product_id')
			.notNull()
			.references(() => products.id, { onDelete: 'cascade' }),
		sku: text('sku').notNull(),
		barcode: text('barcode'),
		name: text('name').notNull(),
		unit: text('unit').notNull().default('pcs'),
		sellingPrice: integer('selling_price').notNull(),
		isActive: boolean('is_active').notNull().default(true),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [
		uniqueIndex('product_skus_sku_uidx').on(t.sku),
		index('product_skus_product_id_idx').on(t.productId),
	],
);

// ─── Inventory ───

export const locations = pgTable('locations', {
	id: uuid('id').defaultRandom().primaryKey(),
	name: text('name').notNull(),
	type: locationTypeEnum('type').notNull().default('STORE'),
	isActive: boolean('is_active').notNull().default(true),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Configurable delivery options and order-value free-shipping rules. */
export const shippingMethods = pgTable(
	'shipping_methods',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		code: text('code').notNull().unique(),
		name: text('name').notNull(),
		fee: integer('fee').notNull().default(0),
		freeShippingThreshold: integer('free_shipping_threshold'),
		isActive: boolean('is_active').notNull().default(true),
		sortOrder: integer('sort_order').notNull().default(0),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [index('shipping_methods_active_sort_idx').on(table.isActive, table.sortOrder)],
);

export const inventory = pgTable(
	'inventory',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		productSkuId: uuid('product_sku_id')
			.notNull()
			.references(() => productSkus.id, { onDelete: 'restrict' }),
		locationId: uuid('location_id')
			.notNull()
			.references(() => locations.id, { onDelete: 'restrict' }),
		// -1 means unlimited stock; 0 means unavailable.
		onHand: integer('on_hand').notNull().default(-1),
		reserved: integer('reserved').notNull().default(0),
		lowStockThreshold: integer('low_stock_threshold').notNull().default(0),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [
		uniqueIndex('inventory_sku_location_uidx').on(t.productSkuId, t.locationId),
		index('inventory_location_id_idx').on(t.locationId),
	],
);

export const inventoryMovements = pgTable(
	'inventory_movements',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		productSkuId: uuid('product_sku_id')
			.notNull()
			.references(() => productSkus.id, { onDelete: 'restrict' }),
		locationId: uuid('location_id')
			.notNull()
			.references(() => locations.id, { onDelete: 'restrict' }),
		type: inventoryMovementTypeEnum('type').notNull(),
		quantity: integer('quantity').notNull(),
		beforeQuantity: integer('before_quantity').notNull(),
		afterQuantity: integer('after_quantity').notNull(),
		referenceType: text('reference_type'),
		referenceId: text('reference_id'),
		note: text('note'),
		createdBy: text('created_by').references(() => user.id, {
			onDelete: 'set null',
		}),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [
		index('inventory_movements_sku_idx').on(t.productSkuId),
		index('inventory_movements_location_idx').on(t.locationId),
		index('inventory_movements_created_at_idx').on(t.createdAt),
	],
);

// ─── Ecommerce ───

export const carts = pgTable(
	'carts',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		status: cartStatusEnum('status').notNull().default('ACTIVE'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [index('carts_user_id_idx').on(t.userId)],
);

export const cartItems = pgTable(
	'cart_items',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		cartId: uuid('cart_id')
			.notNull()
			.references(() => carts.id, { onDelete: 'cascade' }),
		productSkuId: uuid('product_sku_id')
			.notNull()
			.references(() => productSkus.id, { onDelete: 'restrict' }),
		quantity: integer('quantity').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [
		uniqueIndex('cart_items_cart_sku_uidx').on(t.cartId, t.productSkuId),
		index('cart_items_sku_idx').on(t.productSkuId),
	],
);

export const orders = pgTable(
	'orders',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		orderNumber: text('order_number').notNull(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'restrict' }),
		customerId: uuid('customer_id')
			.notNull()
			.references(() => customers.id, { onDelete: 'restrict' }),
		status: orderStatusEnum('status').notNull().default('PENDING_PAYMENT'),
		subtotal: integer('subtotal').notNull(),
		shippingFee: integer('shipping_fee').notNull().default(0),
		discount: integer('discount').notNull().default(0),
		total: integer('total').notNull(),
		paymentStatus: orderPaymentStatusEnum('payment_status')
			.notNull()
			.default('UNPAID'),
		shippingStatus: shippingStatusEnum('shipping_status')
			.notNull()
			.default('NOT_SHIPPED'),
		shippingAddress: jsonb('shipping_address').notNull(),
		note: text('note'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [
		uniqueIndex('orders_order_number_uidx').on(t.orderNumber),
		index('orders_user_id_idx').on(t.userId),
		index('orders_customer_id_idx').on(t.customerId),
		index('orders_status_idx').on(t.status),
		index('orders_created_at_idx').on(t.createdAt),
	],
);

/** Immutable timeline snapshots for every order status transition. */
export const orderStatusHistory = pgTable(
	'order_status_history',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
		status: orderStatusEnum('status').notNull(),
		paymentStatus: orderPaymentStatusEnum('payment_status').notNull(),
		shippingStatus: shippingStatusEnum('shipping_status').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [index('order_status_history_order_created_idx').on(table.orderId, table.createdAt)],
);

export const orderItems = pgTable(
	'order_items',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		orderId: uuid('order_id')
			.notNull()
			.references(() => orders.id, { onDelete: 'cascade' }),
		productId: uuid('product_id')
			.notNull()
			.references(() => products.id, { onDelete: 'restrict' }),
		productSkuId: uuid('product_sku_id')
			.notNull()
			.references(() => productSkus.id, { onDelete: 'restrict' }),
		/** Snapshots — do not rely on live product data after order creation. */
		productName: text('product_name').notNull(),
		sku: text('sku').notNull(),
		unitPrice: integer('unit_price').notNull(),
		quantity: integer('quantity').notNull(),
		subtotal: integer('subtotal').notNull(),
		costSnapshot: integer('cost_snapshot'),
	},
	(t) => [index('order_items_order_id_idx').on(t.orderId)],
);

export const payments = pgTable(
	'payments',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		orderId: uuid('order_id')
			.notNull()
			.references(() => orders.id, { onDelete: 'cascade' }),
		method: paymentMethodEnum('method').notNull().default('BANK_TRANSFER'),
		amount: integer('amount').notNull(),
		status: paymentStatusEnum('status').notNull().default('PENDING'),
		transactionNumber: text('transaction_number'),
		paidAt: timestamp('paid_at', { withTimezone: true }),
		note: text('note'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [index('payments_order_id_idx').on(t.orderId)],
);

export const paymentSubmissions = pgTable(
	'payment_submissions',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		paymentId: uuid('payment_id')
			.notNull()
			.references(() => payments.id, { onDelete: 'cascade' }),
		bankLastFive: text('bank_last_five').notNull(),
		amount: integer('amount').notNull(),
		submittedAt: timestamp('submitted_at', { withTimezone: true })
			.notNull()
			.defaultNow(),
		verifiedAt: timestamp('verified_at', { withTimezone: true }),
		verifiedBy: text('verified_by').references(() => user.id, {
			onDelete: 'set null',
		}),
		note: text('note'),
	},
	(t) => [index('payment_submissions_payment_id_idx').on(t.paymentId)],
);

// ─── Relations（for typed queries; not required for migrations）───

export const userRelations = relations(user, ({ one, many }) => ({
	customer: one(customers),
	sessions: many(session),
	accounts: many(account),
	carts: many(carts),
}));

export const customersRelations = relations(customers, ({ one, many }) => ({
	user: one(user, {
		fields: [customers.userId],
		references: [user.id],
	}),
	addresses: many(addresses),
	orders: many(orders),
}));

export const productsRelations = relations(products, ({ many }) => ({
	skus: many(productSkus),
}));

export const productSkusRelations = relations(productSkus, ({ one, many }) => ({
	product: one(products, {
		fields: [productSkus.productId],
		references: [products.id],
	}),
	inventory: many(inventory),
}));

export const locationsRelations = relations(locations, ({ many }) => ({
	inventory: many(inventory),
	movements: many(inventoryMovements),
}));

export const inventoryRelations = relations(inventory, ({ one }) => ({
	sku: one(productSkus, {
		fields: [inventory.productSkuId],
		references: [productSkus.id],
	}),
	location: one(locations, {
		fields: [inventory.locationId],
		references: [locations.id],
	}),
}));

export const cartsRelations = relations(carts, ({ one, many }) => ({
	user: one(user, {
		fields: [carts.userId],
		references: [user.id],
	}),
	items: many(cartItems),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
	user: one(user, {
		fields: [orders.userId],
		references: [user.id],
	}),
	customer: one(customers, {
		fields: [orders.customerId],
		references: [customers.id],
	}),
	items: many(orderItems),
	payments: many(payments),
}));
