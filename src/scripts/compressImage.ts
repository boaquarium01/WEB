/**
 * 後台上傳圖片前在瀏覽器先壓縮：長邊縮到 2000px，轉成 WebP（不支援時用 JPG），品質 0.85。
 * 手機照片通常可從 5–8MB 降到幾百 KB；GIF（可能是動圖）與已經夠小的圖維持原檔。
 * 壓縮後若沒有比較小，就沿用原檔。
 */
const MAX_EDGE = 2000;
const QUALITY = 0.85;
/** 小於這個大小、而且尺寸也不大的圖不處理 */
const SKIP_UNDER_BYTES = 300 * 1024;

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
	new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

const hasTransparency = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
	// 抽樣檢查透明像素（PNG 去背圖不能轉成 JPG）
	const data = ctx.getImageData(0, 0, width, height).data;
	const step = Math.max(4, Math.floor(data.length / 4 / 40000) * 4);
	for (let i = 3; i < data.length; i += step) if (data[i] < 250) return true;
	return false;
};

export async function compressImage(file: File): Promise<File> {
	const type = file.type.toLowerCase();
	if (!['image/jpeg', 'image/png', 'image/webp'].includes(type)) return file;
	if (typeof createImageBitmap !== 'function') return file;
	let bitmap: ImageBitmap;
	try {
		// imageOrientation 讓手機直拍照片依 EXIF 轉正
		bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
	} catch {
		return file;
	}
	try {
		const longest = Math.max(bitmap.width, bitmap.height);
		if (file.size <= SKIP_UNDER_BYTES && longest <= MAX_EDGE) return file;
		const scale = Math.min(1, MAX_EDGE / longest);
		const width = Math.round(bitmap.width * scale);
		const height = Math.round(bitmap.height * scale);
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext('2d');
		if (!ctx) return file;
		ctx.imageSmoothingQuality = 'high';
		ctx.drawImage(bitmap, 0, 0, width, height);

		let blob = await toBlob(canvas, 'image/webp', QUALITY);
		// 舊版 Safari 不支援輸出 WebP，會回傳 PNG：改用 JPG（有透明背景的圖則保留 PNG）
		if (!blob || blob.type !== 'image/webp') {
			blob = type === 'image/png' && hasTransparency(ctx, width, height)
				? await toBlob(canvas, 'image/png', 1)
				: await toBlob(canvas, 'image/jpeg', QUALITY);
		}
		if (!blob || blob.size >= file.size) return file;
		const ext = blob.type === 'image/webp' ? 'webp' : blob.type === 'image/png' ? 'png' : 'jpg';
		const name = `${file.name.replace(/\.[^.]+$/, '') || 'image'}.${ext}`;
		return new File([blob], name, { type: blob.type, lastModified: Date.now() });
	} catch {
		return file;
	} finally {
		bitmap.close();
	}
}

/** 依序壓縮多張；回傳壓縮後檔案與節省的位元組數 */
export async function compressImages(files: File[]): Promise<{ files: File[]; before: number; after: number }> {
	const out: File[] = [];
	let before = 0;
	let after = 0;
	for (const file of files) {
		const compressed = await compressImage(file);
		before += file.size;
		after += compressed.size;
		out.push(compressed);
	}
	return { files: out, before, after };
}
