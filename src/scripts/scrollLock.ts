/**
 * 鎖定 body 捲動（iOS / Safari 友善：position:fixed + 還原 scrollY，避免關閉遮罩後跳頂或捲動異常）
 * 並補償 scrollbar 寬度，避免橫向跳動。
 */
let lockDepth = 0;
let savedScrollY = 0;

export function applyBodyScrollLock(headerId?: string): void {
	if (typeof document === 'undefined') return;
	const sw = Math.max(0, window.innerWidth - document.documentElement.clientWidth);

	lockDepth += 1;
	if (lockDepth > 1) return;

	savedScrollY = window.scrollY || document.documentElement.scrollTop;

	document.body.style.position = 'fixed';
	document.body.style.top = `-${savedScrollY}px`;
	document.body.style.left = '0';
	document.body.style.right = '0';
	document.body.style.width = '100%';
	document.body.style.overflow = 'hidden';

	if (sw > 0) {
		document.body.style.paddingRight = `${sw}px`;
		if (headerId) {
			const h = document.getElementById(headerId);
			if (h) h.style.paddingRight = `${sw}px`;
		}
	}
}

export function releaseBodyScrollLock(headerId?: string): void {
	if (typeof document === 'undefined') return;

	lockDepth = Math.max(0, lockDepth - 1);
	if (lockDepth > 0) return;

	const y = savedScrollY;

	document.body.style.position = '';
	document.body.style.top = '';
	document.body.style.left = '';
	document.body.style.right = '';
	document.body.style.width = '';
	document.body.style.overflow = '';
	document.body.style.paddingRight = '';
	if (headerId) {
		const h = document.getElementById(headerId);
		if (h) h.style.paddingRight = '';
	}

	requestAnimationFrame(() => {
		window.scrollTo(0, y);
	});
}
