function pickUrlFromObject(o: Record<string, unknown>): string | undefined {
  if (typeof o.url === 'string' && o.url.trim()) return o.url.trim();
  const fmt = o.formats;
  if (fmt && typeof fmt === 'object') {
    const order = ['large', 'medium', 'small', 'thumbnail'] as const;
    for (const k of order) {
      const f = (fmt as Record<string, unknown>)[k];
      if (f && typeof f === 'object') {
        const u = (f as { url?: unknown }).url;
        if (typeof u === 'string' && u.trim()) return u.trim();
      }
    }
  }
  return undefined;
}

/**
 * Strapi 5 多媒體欄位：常為「物件陣列」；Strapi 4 風格為 { data: [...] }
 */
export function extractStrapiMediaItems(raw: unknown): unknown[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== 'object') return [];
  const o = raw as Record<string, unknown>;
  if (Array.isArray(o.data)) return o.data;
  return [];
}

/** Strapi Media REST：扁平 { url }、巢狀 data／attributes、或僅有 formats */
export function resolveMediaUrl(base: string, raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  let url: string | undefined;

  const inner = o.data;
  if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
    const d = inner as Record<string, unknown>;
    url = pickUrlFromObject(d);
    if (!url && d.attributes && typeof d.attributes === 'object') {
      url = pickUrlFromObject(d.attributes as Record<string, unknown>);
    }
  }
  if (!url) url = pickUrlFromObject(o);
  if (!url && o.attributes && typeof o.attributes === 'object') {
    url = pickUrlFromObject(o.attributes as Record<string, unknown>);
  }

  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  const b = base.replace(/\/+$/, '');
  return `${b}${url.startsWith('/') ? '' : '/'}${url}`;
}
