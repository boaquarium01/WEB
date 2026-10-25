type SkuIdentity = { sku: string; variantKey?: string | null; sourceSku?: string | null };

export function isSpecificationSku(row: SkuIdentity): boolean {
	return row.variantKey != null || row.sku.startsWith('VAR-') || Boolean(row.sourceSku?.startsWith('VAR-'));
}

export function findDefaultProductSku<T extends SkuIdentity>(rows: T[], defaultCode?: string): T | undefined {
	const defaults = rows.filter((row) => !isSpecificationSku(row));
	return defaults.find((row) => defaultCode && (row.sku === defaultCode || row.sourceSku === defaultCode)) ?? defaults[0];
}

export function selectProductEditorSkus<T extends SkuIdentity>(rows: T[], enabled: boolean, variantKeys: string[]): T[] {
	if (enabled) {
		const keys = new Set(variantKeys);
		return rows.filter((row) => row.variantKey != null && keys.has(row.variantKey));
	}
	const row = findDefaultProductSku(rows);
	return row ? [row] : [];
}
