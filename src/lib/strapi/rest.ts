/** 將 Strapi REST 的 data 列解包為扁平物件（相容 attributes 包一層或已扁平） */
export function unwrapStrapiEntry(item: unknown): Record<string, unknown> {
  if (!item || typeof item !== 'object') return {};
  const x = item as Record<string, unknown>;
  if (x.attributes && typeof x.attributes === 'object' && !Array.isArray(x.attributes)) {
    const merged = { ...(x.attributes as Record<string, unknown>) };
    if (x.id !== undefined) merged.id = x.id;
    if (x.documentId !== undefined) merged.documentId = x.documentId;
    return merged;
  }
  return { ...x };
}

export function unwrapStrapiList(json: unknown): Record<string, unknown>[] {
  if (!json || typeof json !== 'object') return [];
  const root = json as { data?: unknown };
  if (Array.isArray(root.data)) return root.data.map(unwrapStrapiEntry);
  if (root.data && typeof root.data === 'object') return [unwrapStrapiEntry(root.data)];
  return [];
}

/** manyToOne / oneToOne 關聯 */
export function unwrapRelationOne(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const d = o.data;
  if (d === null || d === undefined) return null;
  if (Array.isArray(d)) {
    const first = d[0];
    return first && typeof first === 'object' ? unwrapStrapiEntry(first) : null;
  }
  if (typeof d === 'object') return unwrapStrapiEntry(d);
  return null;
}

export function getStrapiMetaPageCount(json: unknown): number {
  if (!json || typeof json !== 'object') return 1;
  const m = (json as { meta?: { pagination?: { pageCount?: number } } }).meta?.pagination?.pageCount;
  return typeof m === 'number' && m >= 1 ? m : 1;
}
