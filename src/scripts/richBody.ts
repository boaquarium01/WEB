/**
 * 商品內文編輯器（類似蝦皮商品描述）：可輸入文字、在游標處插入圖片（最多 12 張、3000 字）。
 * 儲存成 Sanity Portable Text：文字段落 { _type:'block' }＋圖片 { _type:'image', asset }。
 */
export const BODY_MAX_CHARS = 3000;
export const BODY_MAX_IMAGES = 12;

type Block = Record<string, unknown>;
export type BodyEditor = {
	set: (value: unknown) => void;
	get: () => Block[];
	validate: () => string;
	busy: () => boolean;
};

const escapeHtml = (value: string) => value.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);

function blockText(block: Block): string {
	const children = Array.isArray(block.children) ? (block.children as { text?: string }[]) : [];
	return children.map((child) => child?.text ?? '').join('');
}

export function createBodyEditor(card: HTMLElement, options: { upload: (file: File) => Promise<string | number>; onChange: () => void; onStatus: (text: string) => void }): BodyEditor {
	card.insertAdjacentHTML(
		'beforeend',
		`<div class="rb">
			<div class="rb__bar">
				<label class="rb__add"><i class="fa-regular fa-image" aria-hidden="true"></i><span>新增圖片 (<b class="rb__imgs">0</b>/${BODY_MAX_IMAGES})</span><input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden></label>
				<span class="rb__count"><b>0</b>/${BODY_MAX_CHARS}</span>
			</div>
			<div class="rb__area" contenteditable="true" role="textbox" aria-multiline="true" aria-label="內文" data-placeholder="輸入商品描述，可在任意位置插入圖片"></div>
		</div>`,
	);
	const area = card.querySelector<HTMLElement>('.rb__area')!;
	const fileInput = card.querySelector<HTMLInputElement>('.rb input[type="file"]')!;
	const imgCount = card.querySelector<HTMLElement>('.rb__imgs')!;
	const charCount = card.querySelector<HTMLElement>('.rb__count b')!;
	const countBox = card.querySelector<HTMLElement>('.rb__count')!;
	let uploading = 0;
	let savedRange: Range | null = null;

	const figureHtml = (assetId: string, url: string) =>
		`<figure class="rb__img" contenteditable="false" data-asset="${escapeHtml(assetId)}"><img src="${escapeHtml(url)}" alt=""><button type="button" class="rb__del" aria-label="移除圖片">×</button></figure>`;

	function textLength(): number {
		return get().filter((b) => b._type === 'block').reduce((sum, b) => sum + blockText(b).length, 0);
	}
	function refresh() {
		const images = area.querySelectorAll('.rb__img').length;
		imgCount.textContent = String(images);
		const chars = textLength();
		charCount.textContent = String(chars);
		countBox.classList.toggle('is-over', chars > BODY_MAX_CHARS);
		area.classList.toggle('is-empty', !images && !area.textContent?.trim());
	}

	function set(value: unknown) {
		const blocks = Array.isArray(value) ? (value as Block[]) : typeof value === 'string' && value ? value.split('\n').map((text) => ({ _type: 'block', children: [{ text }] })) : [];
		const html = blocks
			.map((block) => {
				if (block._type === 'image') {
					const asset = block.asset as { _ref?: string } | undefined;
					const id = String(asset?._ref ?? block.assetId ?? '');
					return id ? figureHtml(id, String(block.url ?? '')) : '';
				}
				const text = block._type === 'block' ? blockText(block) : block.type === 'paragraph' ? blockText(block) : '';
				return `<div>${text ? escapeHtml(text) : '<br>'}</div>`;
			})
			.join('');
		area.innerHTML = html || '<div><br></div>';
		refresh();
	}

	/** 依畫面順序轉回 Portable Text；空白行不存 */
	function get(): Block[] {
		const out: Block[] = [];
		let n = 0;
		// 固定的 key，讓「有沒有修改」的比對穩定
		const key = () => `b${n++}`;
		let buffer = '';
		const flush = () => {
			for (const line of buffer.split('\n')) {
				const text = line.replace(/ /g, ' ').trimEnd();
				if (!text.trim()) continue;
				out.push({ _type: 'block', _key: key(), style: 'normal', markDefs: [], children: [{ _type: 'span', _key: key(), text, marks: [] }] });
			}
			buffer = '';
		};
		const walk = (node: Node) => {
			if (node instanceof HTMLElement && node.classList.contains('rb__img')) {
				flush();
				out.push({ _type: 'image', _key: key(), asset: { _type: 'reference', _ref: node.dataset.asset } });
				return;
			}
			if (node.nodeType === Node.TEXT_NODE) { buffer += node.textContent ?? ''; return; }
			if (!(node instanceof HTMLElement)) return;
			if (node.tagName === 'BR') { buffer += '\n'; return; }
			const isBlock = /^(DIV|P|LI|H\d|BLOCKQUOTE)$/.test(node.tagName);
			if (isBlock && buffer && !buffer.endsWith('\n')) buffer += '\n';
			node.childNodes.forEach(walk);
			if (isBlock && !buffer.endsWith('\n')) buffer += '\n';
		};
		area.childNodes.forEach(walk);
		flush();
		return out;
	}

	function topLevelOf(node: Node | null): ChildNode | null {
		while (node && node.parentNode !== area) node = node.parentNode;
		return node as ChildNode | null;
	}

	async function insertImages(files: File[]) {
		const room = BODY_MAX_IMAGES - area.querySelectorAll('.rb__img').length;
		if (room <= 0) { options.onStatus(`內文最多 ${BODY_MAX_IMAGES} 張圖片`); return; }
		const picked = files.filter((f) => /^image\/(jpeg|png|webp|gif)$/.test(f.type) && f.size <= 20 * 1024 * 1024).slice(0, room);
		if (picked.length < files.length) options.onStatus(`已略過不支援或超過數量的圖片（最多 ${BODY_MAX_IMAGES} 張、單張 20MB）`);
		let anchor = savedRange && area.contains(savedRange.startContainer) ? topLevelOf(savedRange.startContainer) : null;
		for (const file of picked) {
			const holder = document.createElement('figure');
			holder.className = 'rb__img is-loading';
			holder.contentEditable = 'false';
			holder.innerHTML = `<img src="${URL.createObjectURL(file)}" alt=""><span class="rb__spin">上傳中…</span>`;
			if (anchor && anchor.parentNode === area) anchor.after(holder); else area.append(holder);
			anchor = holder;
			uploading += 1;
			refresh();
			try {
				const id = String(await options.upload(file));
				holder.dataset.asset = id;
				holder.classList.remove('is-loading');
				holder.querySelector('.rb__spin')?.remove();
				holder.insertAdjacentHTML('beforeend', '<button type="button" class="rb__del" aria-label="移除圖片">×</button>');
			} catch (error) {
				holder.remove();
				options.onStatus(`圖片上傳失敗：${error instanceof Error ? error.message : ''}`);
			} finally {
				uploading -= 1;
			}
		}
		// 圖片後面留一行，方便接著打字
		if (anchor && anchor.parentNode === area && !(anchor.nextSibling instanceof HTMLDivElement)) {
			const line = document.createElement('div');
			line.innerHTML = '<br>';
			anchor.after(line);
		}
		refresh();
		options.onChange();
	}

	const remember = () => {
		const selection = window.getSelection();
		if (selection?.rangeCount && area.contains(selection.anchorNode)) savedRange = selection.getRangeAt(0).cloneRange();
	};
	area.addEventListener('keyup', remember);
	area.addEventListener('mouseup', remember);
	area.addEventListener('input', () => { remember(); refresh(); });
	area.addEventListener('click', (event) => {
		const del = (event.target as Element).closest?.('.rb__del');
		if (!del) return;
		del.closest('.rb__img')?.remove();
		refresh();
		options.onChange();
	});
	// 貼上只取純文字，避免帶入其他網站的格式
	area.addEventListener('paste', (event) => {
		const files = Array.from(event.clipboardData?.files ?? []);
		event.preventDefault();
		if (files.length) { remember(); void insertImages(files); return; }
		const text = event.clipboardData?.getData('text/plain') ?? '';
		document.execCommand('insertText', false, text);
	});
	area.addEventListener('drop', (event) => {
		const files = Array.from(event.dataTransfer?.files ?? []);
		if (!files.length) return;
		event.preventDefault();
		void insertImages(files);
	});
	fileInput.addEventListener('change', () => {
		const files = Array.from(fileInput.files ?? []);
		fileInput.value = '';
		if (files.length) void insertImages(files);
	});

	return {
		set,
		get,
		busy: () => uploading > 0,
		validate: () => {
			if (uploading > 0) return '內文圖片仍在上傳，完成後再儲存';
			const chars = textLength();
			return chars > BODY_MAX_CHARS ? `內文最多 ${BODY_MAX_CHARS} 字（目前 ${chars} 字）` : '';
		},
	};
}
