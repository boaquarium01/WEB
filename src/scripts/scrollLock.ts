/** 鎖定 body 捲動並補償 scrollbar 寬度，避免遮罩開啟時版面橫向跳動 */
export function applyBodyScrollLock(headerId?: string): void {
	if (typeof document === 'undefined') return;
	const sw = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
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
	document.body.style.overflow = '';
	document.body.style.paddingRight = '';
	if (headerId) {
		const h = document.getElementById(headerId);
		if (h) h.style.paddingRight = '';
	}
}
