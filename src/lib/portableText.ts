import { toHTML } from '@portabletext/to-html';
import type { PortableTextBlock } from '@portabletext/types';

/** 後台 textarea 純文字 → Portable Text blocks（對應 Sanity schema `array of block`） */
export function plainTextToPortableBlocks(text: string): PortableTextBlock[] {
	const s = String(text ?? '').replace(/\r\n/g, '\n');
	const lines = s.split('\n');
	const blocks: PortableTextBlock[] = [];
	let i = 0;
	for (const line of lines) {
		const tline = line.trimEnd();
		if (!tline.trim()) continue;
		const key = `b_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 8)}`;
		i += 1;
		blocks.push({
			_type: 'block',
			_key: key,
			style: 'normal',
			markDefs: [],
			children: [{ _type: 'span', _key: `${key}_s`, text: tline, marks: [] }]
		} as PortableTextBlock);
	}
	return blocks;
}

export function portableTextToHtml(blocks: unknown[] | null | undefined): string {
  if (!Array.isArray(blocks) || blocks.length === 0) return '';
  try {
    return toHTML(blocks as PortableTextBlock[]);
  } catch {
    return '';
  }
}

/** 從 Portable Text 抽出純文字（供摘要、SEO、關鍵字） */
export function portableBlocksToPlainText(blocks: unknown[] | null | undefined): string {
  if (!Array.isArray(blocks)) return '';
  const lines: string[] = [];
  for (const block of blocks) {
    if (!block || typeof block !== 'object') continue;
    const b = block as { _type?: string; children?: unknown[] };
    if (b._type !== 'block' || !Array.isArray(b.children)) continue;
    let line = '';
    for (const child of b.children) {
      if (child && typeof child === 'object' && 'text' in child) {
        line += String((child as { text?: string }).text ?? '');
      }
    }
    const t = line.trim();
    if (t) lines.push(t);
  }
  return lines.join('\n');
}
