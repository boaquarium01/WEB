/**
 * Strapi Rich Text (Blocks) → 純文字／簡易 HTML（供摘要與商品頁；非 Portable Text）
 */

type Blockish = Record<string, unknown>;

function inlineToPlain(children: unknown): string {
  if (!Array.isArray(children)) return '';
  let out = '';
  for (const c of children) {
    if (!c || typeof c !== 'object') continue;
    const n = c as Blockish;
    if (n.type === 'text' && typeof n.text === 'string') out += n.text;
    else if (Array.isArray(n.children)) out += inlineToPlain(n.children);
  }
  return out;
}

function inlineToHtml(children: unknown): string {
  if (!Array.isArray(children)) return '';
  let out = '';
  for (const c of children) {
    if (!c || typeof c !== 'object') continue;
    const n = c as Blockish;
    if (n.type === 'text' && typeof n.text === 'string') {
      let t = escapeHtml(n.text);
      if (n.bold) t = `<strong>${t}</strong>`;
      if (n.italic) t = `<em>${t}</em>`;
      if (n.underline) t = `<u>${t}</u>`;
      if (n.code) t = `<code>${t}</code>`;
      out += t;
    } else if (n.type === 'link' && typeof n.url === 'string') {
      const inner = inlineToHtml(n.children);
      const rel = typeof n.rel === 'string' ? n.rel : 'noreferrer noopener';
      const target = typeof n.target === 'string' ? n.target : '_blank';
      out += `<a href="${escapeHtml(n.url)}" rel="${escapeHtml(rel)}" target="${escapeHtml(target)}">${inner}</a>`;
    } else if (Array.isArray(n.children)) {
      out += inlineToHtml(n.children);
    }
  }
  return out;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function strapiBlocksToPlainText(blocks: unknown[] | null | undefined): string {
  if (!Array.isArray(blocks) || blocks.length === 0) return '';
  const parts: string[] = [];
  for (const b of blocks) {
    if (!b || typeof b !== 'object') continue;
    const block = b as Blockish;
    const t = String(block.type ?? '');
    if (t === 'paragraph' || t === 'quote') {
      const p = inlineToPlain(block.children);
      if (p.trim()) parts.push(p);
    } else if (t === 'heading') {
      const p = inlineToPlain(block.children);
      if (p.trim()) parts.push(p);
    } else if (t === 'list') {
      const items = Array.isArray(block.children) ? block.children : [];
      for (const item of items) {
        if (item && typeof item === 'object' && (item as Blockish).type === 'list-item') {
          const p = inlineToPlain((item as Blockish).children);
          if (p.trim()) parts.push(p);
        }
      }
    } else if (t === 'code') {
      const p = inlineToPlain(block.children);
      if (p.trim()) parts.push(p);
    }
  }
  return parts.join('\n').trim();
}

export function strapiBlocksToHtml(blocks: unknown[] | null | undefined): string {
  if (!Array.isArray(blocks) || blocks.length === 0) return '';
  const chunks: string[] = [];
  for (const b of blocks) {
    if (!b || typeof b !== 'object') continue;
    const block = b as Blockish;
    const t = String(block.type ?? '');
    if (t === 'paragraph') {
      chunks.push(`<p>${inlineToHtml(block.children)}</p>`);
    } else if (t === 'quote') {
      chunks.push(`<blockquote>${inlineToHtml(block.children)}</blockquote>`);
    } else if (t === 'heading') {
      const level = typeof block.level === 'number' && block.level >= 1 && block.level <= 6 ? block.level : 2;
      chunks.push(`<h${level}>${inlineToHtml(block.children)}</h${level}>`);
    } else if (t === 'list') {
      const tag = block.format === 'ordered' ? 'ol' : 'ul';
      const items = Array.isArray(block.children) ? block.children : [];
      const lis: string[] = [];
      for (const item of items) {
        if (item && typeof item === 'object' && (item as Blockish).type === 'list-item') {
          lis.push(`<li>${inlineToHtml((item as Blockish).children)}</li>`);
        }
      }
      if (lis.length) chunks.push(`<${tag}>${lis.join('')}</${tag}>`);
    } else if (t === 'code') {
      chunks.push(`<pre><code>${escapeHtml(inlineToPlain(block.children))}</code></pre>`);
    }
  }
  return chunks.join('\n');
}

/** 與 Portable Text 區分：第一筆為 block 且有 _type === 'block' */
export function isPortableTextBlocks(blocks: unknown[] | null | undefined): boolean {
  if (!Array.isArray(blocks) || blocks.length === 0) return false;
  const x = blocks[0];
  if (!x || typeof x !== 'object') return false;
  return (x as Blockish)._type === 'block';
}
