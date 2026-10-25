import test from 'node:test';
import assert from 'node:assert/strict';
import { findSpecificationCombination, generateSpecificationCombinations, normalizeSpecifications } from './specifications';
import { unitPriceForQuantity, validateQuantityPriceTiers } from '../services/quantity-pricing';
import { findDefaultProductSku, selectProductEditorSkus } from '../services/product-sku-identity';
import { mergeSpecificationGallery, findContentVariant, specificationImage, defaultPurchasableSku } from './specification-media';

test('option images join gallery once while preserving original keys and crop', () => {
	const image = { _key: 'original', asset: { _ref: 'image-one' }, crop: { top: 0.1 } };
	const groups = [{ options: [{ image }, {}, { image: { asset: { _ref: 'image-two' } } }] }];
	const merged = mergeSpecificationGallery([image], groups);
	assert.equal(merged.length, 2);
	assert.deepEqual(merged[0], image);
	assert.deepEqual(mergeSpecificationGallery(merged, groups), merged);
});

test('cart and storefront resolve images by stable variant identity after merchant SKU changes', () => {
	const content = { imageUrl: 'main', variants: [{ sku: 'VAR-ORIGINAL', variantKey: 'stable', optionIds: ['black', 'long'], optionNames: ['黑', '長'] }], specifications: [
		{ id: 'color', name: '顏色', order: 0, options: [{ id: 'black', name: '黑', order: 0, imageUrl: 'black-image' }, { id: 'white', name: '白', order: 1, imageUrl: null }] },
		{ id: 'size', name: '尺寸', order: 1, options: [{ id: 'long', name: '長', order: 0, imageUrl: 'long-image' }] },
	] };
	const variant = findContentVariant(content, { sku: 'CUSTOM-123', variantKey: 'stable' });
	assert.deepEqual(variant?.optionIds, ['black', 'long']);
	assert.equal(specificationImage(content, variant!.optionIds), 'black-image');
	assert.equal(specificationImage(content, ['white', 'long']), 'main');
	assert.equal(specificationImage(content, ['white']), 'main');
	assert.equal(findContentVariant(content, { sku: 'CUSTOM-123', sourceSku: 'VAR-ORIGINAL' }), variant);
});

test('default selection skips inactive, unpriced, sold out and insufficient minimum quantity combinations', () => {
	const rows = [
		{ isActive: true, sellingPrice: 100, available: 0 },
		{ isActive: false, sellingPrice: 100, available: -1 },
		{ isActive: true, sellingPrice: 0, available: -1 },
		{ isActive: true, sellingPrice: 100, available: 1 },
		{ isActive: true, sellingPrice: 200, available: -1 },
	];
	assert.equal(defaultPurchasableSku(rows, 2), rows[4]);
	assert.equal(defaultPurchasableSku(rows, 1), rows[3]);
	assert.equal(defaultPurchasableSku([]), undefined);
});

const spec = (name: string, options: Array<{ _key: string; name: string; image?: string }>) => ({ _key: `${name}_id`, name, options });

test('saving native Sanity image references preserves images on a read/write round trip', () => {
	const groups = normalizeSpecifications([spec('color', [{ _key: 'black', name: '黑', image: 'image-black-640x640-webp' }])]);
	assert.deepEqual(normalizeSpecifications(groups), groups);
});

test('disabled specifications show only the default SKU and exclude retained historical combinations', () => {
	const history = { id: 'old', sku: 'CUSTOM-RED', sourceSku: 'VAR-OLD', variantKey: 'red', skuActive: false, price: 400, stock: 5 };
	const standard = { id: 'default', sku: 'CUSTOM-DEFAULT', sourceSku: 'SKU-PRODUCT', variantKey: null, skuActive: true, price: 300, stock: 8 };
	const rows = [history, standard];
	assert.deepEqual(selectProductEditorSkus(rows, false, ['red']), [standard]);
	assert.equal(findDefaultProductSku(rows, 'SKU-PRODUCT'), standard);
	assert.deepEqual(history, { id: 'old', sku: 'CUSTOM-RED', sourceSku: 'VAR-OLD', variantKey: 'red', skuActive: false, price: 400, stock: 5 });
});

test('a variant-only product never repurposes its historical SKU as the default', () => {
	const rows = [{ sku: 'RENAMED', sourceSku: 'VAR-LEGACY', variantKey: null }];
	assert.equal(findDefaultProductSku(rows), undefined);
	assert.deepEqual(selectProductEditorSkus(rows, false, []), []);
});

test('enabled specifications show configured combinations and exclude deleted combinations even for offline products', () => {
	const rows = [
		{ sku: 'SKU-DEFAULT', variantKey: null, skuActive: false },
		{ sku: 'CUSTOM-A', variantKey: 'keep', skuActive: false },
		{ sku: 'CUSTOM-B', variantKey: 'deleted', skuActive: true },
	];
	assert.deepEqual(selectProductEditorSkus(rows, true, ['keep']), [rows[1]]);
});

test('enforces the two specification groups and ten options per group', () => {
	assert.throws(() => normalizeSpecifications([spec('a', [{ _key: 'a1', name: '1' }]), spec('b', [{ _key: 'b1', name: '1' }]), spec('c', [{ _key: 'c1', name: '1' }])]), /最多 2 組/);
	assert.throws(() => normalizeSpecifications([spec('a', Array.from({ length: 11 }, (_, i) => ({ _key: `a${i}`, name: `${i}` })))]), /最多 10 個/);
	assert.throws(() => normalizeSpecifications([spec('a', [{ _key: 'a1', name: ' ' }])]), /不可空白/);
	assert.throws(() => normalizeSpecifications([spec('a', [{ _key: 'a1', name: '白' }, { _key: 'a2', name: '白 ' }])]), /重複/);
});

test('option images are optional and are retained as Sanity references when supplied', () => {
	const [specification] = normalizeSpecifications([spec('色溫', [{ _key: 'k1', name: '1000K' }, { _key: 'k2', name: '2000K', image: 'image-asset-abc' }])]);
	assert.equal(specification?.options[0]?.image, undefined);
	assert.equal(specification?.options[1]?.image?.asset._ref, 'image-asset-abc');
});

test('creates Cartesian product with a maximum of one hundred combinations', () => {
	const normalized = normalizeSpecifications([
		spec('色', Array.from({ length: 10 }, (_, i) => ({ _key: `c${i}`, name: `色${i}` }))),
		spec('尺寸', Array.from({ length: 10 }, (_, i) => ({ _key: `s${i}`, name: `${i}cm` }))),
	]);
	const combinations = generateSpecificationCombinations(normalized);
	assert.equal(combinations.length, 100);
	assert.deepEqual(combinations[0]?.optionNames, ['色0', '0cm']);
});

test('editing labels and reordering groups retains the same combination IDs', () => {
	const original = normalizeSpecifications([spec('色', [{ _key: 'black', name: '黑' }, { _key: 'white', name: '白' }]), spec('尺寸', [{ _key: '30', name: '30cm' }, { _key: '45', name: '45cm' }])]);
	const changed = normalizeSpecifications([spec('尺寸', [{ _key: '30', name: '30 公分' }, { _key: '45', name: '45 公分' }]), spec('顏色', [{ _key: 'black', name: '黑色' }, { _key: 'white', name: '白色' }])]);
	assert.deepEqual(generateSpecificationCombinations(original).map((c) => c._key).sort(), generateSpecificationCombinations(changed).map((c) => c._key).sort());
	// PostgreSQL SKU rows are keyed by the stable combination _key; changing labels/order won't reassign price or stock.
	const matchingKey = generateSpecificationCombinations(original).find((c) => c.optionIds.includes('black') && c.optionIds.includes('30'))?._key ?? '';
	const skuCommerce = new Map([[matchingKey, { price: 500, stock: 7 }]]);
	assert.deepEqual(skuCommerce.get(generateSpecificationCombinations(changed).find((c) => c.optionIds.includes('black') && c.optionIds.includes('30'))?._key ?? ''), { price: 500, stock: 7 });
});

test('cart selection resolves to the selected combination SKU ID', () => {
	const specs = normalizeSpecifications([spec('色', [{ _key: 'black', name: '黑色' }, { _key: 'white', name: '白色' }]), spec('尺寸', [{ _key: '30', name: '30cm' }, { _key: '45', name: '45cm' }])]);
	const chosen = ['white', '45'];
	const skuCombinations = generateSpecificationCombinations(specs).map((combo, i) => ({ ...combo, skuId: `sku-${i}` }));
	const selectedSku = findSpecificationCombination(skuCombinations, chosen);
	assert.equal(selectedSku?.skuId, 'sku-3');
	assert.equal(findSpecificationCombination(skuCombinations, ['white']), null);
});

test('quantity discounts choose the matching tier for product quantity', () => {
	const tiers = [
		{ minQuantity: 3, maxQuantity: 5, unitPrice: 90 },
		{ minQuantity: 6, maxQuantity: null, unitPrice: 80 },
	];
	assert.equal(unitPriceForQuantity(100, 2, tiers), 100);
	assert.equal(unitPriceForQuantity(100, 4, tiers), 90);
	assert.equal(unitPriceForQuantity(100, 8, tiers), 80);
});

test('rejects overlapping or malformed quantity discount tiers', () => {
	assert.match(validateQuantityPriceTiers([
		{ minQuantity: 2, maxQuantity: 5, unitPrice: 90 },
		{ minQuantity: 5, maxQuantity: null, unitPrice: 80 },
	]) ?? '', /不可重疊/);
	assert.match(validateQuantityPriceTiers([{ minQuantity: 1, maxQuantity: null, unitPrice: -1 }]) ?? '', /無效/);
});
