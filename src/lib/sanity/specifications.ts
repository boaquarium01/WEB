export type SpecificationInput = {
	_key?: unknown;
	name?: unknown;
	options?: unknown;
};

export type NormalizedSpecification = {
	_type: 'object';
	_key: string;
	name: string;
	order: number;
	options: Array<{ _type: 'object'; _key: string; name: string; order: number; image?: { _type: 'image'; asset: { _type: 'reference'; _ref: string } } }>;
};

export type SpecificationCombination = {
	_key: string;
	optionIds: string[];
	optionNames: string[];
};

export function normalizeSpecifications(value: unknown): NormalizedSpecification[] {
	if (!Array.isArray(value)) throw new Error('規格資料格式錯誤');
	if (value.length > 2) throw new Error('規格最多 2 組');
	const normalized = value.map((raw, specIndex) => {
		if (!raw || typeof raw !== 'object') throw new Error('規格資料格式錯誤');
		const spec = raw as SpecificationInput;
		const name = String(spec.name ?? '').trim();
		if (!name) throw new Error(`請填寫第 ${specIndex + 1} 組規格名稱`);
		if (!Array.isArray(spec.options) || spec.options.length < 1) throw new Error(`${name} 至少需要一個規格選項`);
		if (spec.options.length > 10) throw new Error(`${name} 最多 10 個規格選項`);
		const seen = new Set<string>();
		const options = spec.options.map((rawOption, optionIndex) => {
			if (!rawOption || typeof rawOption !== 'object') throw new Error(`${name} 有無效的規格選項`);
			const option = rawOption as Record<string, unknown>;
			const optionName = String(option.name ?? '').trim();
			if (!optionName) throw new Error(`${name} 的規格選項不可空白`);
			const normalizedName = optionName.toLocaleLowerCase();
			if (seen.has(normalizedName)) throw new Error(`${name} 不可有重複選項「${optionName}」`);
			seen.add(normalizedName);
			const imageId = typeof option.image === 'string' ? option.image : typeof option.image === 'object' && option.image !== null ? String((option.image as { id?: unknown; asset?: { _ref?: unknown } }).id ?? (option.image as { asset?: { _ref?: unknown } }).asset?._ref ?? '') : '';
			return {
				_type: 'object' as const,
				_key: String(option._key ?? '').trim() || `opt_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`,
				name: optionName,
				order: optionIndex,
				...(specIndex === 0 && imageId ? { image: { _type: 'image' as const, asset: { _type: 'reference' as const, _ref: imageId } } } : {}),
			};
		});
		return {
			_type: 'object' as const,
			_key: String(spec._key ?? '').trim() || `spec_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`,
			name,
			order: specIndex,
			options,
		};
	});
	const allIds = normalized.flatMap((specification) => [specification._key, ...specification.options.map((option) => option._key)]);
	if (new Set(allIds).size !== allIds.length) throw new Error('規格與選項 ID 不可重複');
	return normalized;
}

export function generateSpecificationCombinations(specifications: NormalizedSpecification[]): SpecificationCombination[] {
	if (!specifications.length) return [];
	return specifications.reduce<SpecificationCombination[]>((combinations, specification) => {
		const options = [...specification.options].sort((a, b) => a.order - b.order);
		if (!combinations.length) return options.map((option) => ({ _key: `combo_${option._key}`, optionIds: [option._key], optionNames: [option.name] }));
		return combinations.flatMap((combo) => options.map((option) => ({
			_key: `combo_${[...combo.optionIds, option._key].sort().join('_')}`,
			optionIds: [...combo.optionIds, option._key],
			optionNames: [...combo.optionNames, option.name],
		})));
	}, []);
}

export function findSpecificationCombination<T extends { optionIds: string[] }>(combinations: T[], selectedOptionIds: string[]): T | null {
	if (!selectedOptionIds.length || selectedOptionIds.some((id) => !id)) return null;
	return combinations.find((combination) => combination.optionIds.length === selectedOptionIds.length && combination.optionIds.every((id, index) => id === selectedOptionIds[index])) ?? null;
}
