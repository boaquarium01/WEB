/**
 * Service layer entrypoint.
 */

export {
	syncProductsFromSanity,
	type ProductSyncResult,
} from './product-sync';
export {
	ensureCustomerForUser,
	getCustomerByUserId,
	updateCustomerProfile,
	type Customer,
} from './customer';
export {
	createAddressForUser,
	deleteAddressForUser,
	getAddressForUser,
	listAddressesForUser,
	updateAddressForUser,
	type Address,
	type AddressInput,
} from './address';
export {
	formatTwd,
	getCatalogProductBySlug,
	listCatalogCategories,
	listCatalogProducts,
	type CatalogProductDetail,
	type CatalogProductListItem,
} from './catalog';
export {
	addToCart,
	getCartItemCount,
	getCartView,
	removeCartItem,
	updateCartItemQuantity,
	type CartView,
} from './cart';
export {
	placeOrderFromCart,
	type PlaceOrderResult,
	type ShippingAddressSnapshot,
} from './checkout';
export { getShippingFee, listShippingMethods, saveShippingMethod, type ShippingMethod } from './shipping';
export {
	getOrderForUser,
	orderStatusLabel,
	paymentStatusLabel,
	canSubmitBankLastFive,
	canCancelOrder,
	type OrderView,
} from './order';
export {
	listOrdersForUser,
	cancelOrderForUser,
	shippingStatusLabel,
	type OrderListItem,
} from './order-management';
export {
	adjustInventory,
	countLowStock,
	getStoreLocation,
	listInventory,
	listInventoryMovements,
	movementTypeLabel,
	updateLowStockThreshold,
	availableStock,
	type InventoryRow,
	type InventoryMovementRow,
	type AdjustInventoryInput,
	type ManualMovementType,
} from './inventory';
export {
	getAdminDashboardStats,
	listAdminOrders,
	getAdminOrder,
	adminConfirmPayment,
	adminMarkShipped,
	adminCompleteOrder,
	adminCancelOrder,
	listAdminProducts,
	type AdminDashboardStats,
	type AdminOrderListItem,
	type AdminOrderDetail,
	type AdminProductRow,
} from './admin-orders';
export {
	getBankTransferInfo,
	submitBankTransferLastFive,
	type BankTransferInfo,
	type PaymentSubmissionView,
} from './payment';
