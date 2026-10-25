export type QuantityPriceTier = {
	minQuantity: number;
	maxQuantity: number | null;
	unitPrice: number;
};

/** Select a product-level quantity price break using the total quantity across its SKUs. */
export function unitPriceForQuantity(basePrice: number, quantity: number, tiers: QuantityPriceTier[]): number {
	const tier = [...tiers]
		.filter((item) => quantity >= item.minQuantity && (item.maxQuantity == null || quantity <= item.maxQuantity))
		.sort((a, b) => b.minQuantity - a.minQuantity)[0];
	return tier?.unitPrice ?? basePrice;
}

export function validateQuantityPriceTiers(tiers: QuantityPriceTier[]): string | null {
	if (tiers.length > 10) return '多件優惠最多設定 10 個區間';
	const sorted = [...tiers].sort((a, b) => a.minQuantity - b.minQuantity);
	for (let index = 0; index < sorted.length; index += 1) {
		const tier = sorted[index]!;
		if (!Number.isInteger(tier.minQuantity) || tier.minQuantity < 2 || !Number.isInteger(tier.unitPrice) || tier.unitPrice < 0) return `優惠區間 ${index + 1} 數量或單價無效`;
		if (tier.maxQuantity != null && (!Number.isInteger(tier.maxQuantity) || tier.maxQuantity < tier.minQuantity)) return `優惠區間 ${index + 1} 最大數量無效`;
		const next = sorted[index + 1];
		if (next && (tier.maxQuantity == null || tier.maxQuantity >= next.minQuantity)) return '多件優惠數量區間不可重疊，未填最大數量的區間須放在最後';
	}
	return null;
}
