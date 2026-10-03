/**
 * on_hand = -1 represents unlimited stock; otherwise available = on_hand - reserved.
 * Never expose raw onHand alone as sellable quantity.
 */
export function availableStock(onHand: number, reserved: number): number {
	if (onHand < 0) return -1;
	return onHand - reserved;
}
