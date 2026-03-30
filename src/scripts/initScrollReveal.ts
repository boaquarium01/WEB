const REVEAL_OPTS: IntersectionObserverInit = {
	rootMargin: '0px 0px -7% 0px',
	threshold: 0.14
};

/** 全站 .reveal-on-scroll / .reveal-stagger（與首頁既有 class 一致） */
export function initScrollReveal(): void {
	if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') return;

	const reduced =
		typeof window.matchMedia === 'function' &&
		window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	/** 窄螢幕已用 CSS 靜態顯示，若仍掛 IO，捲動時大量 callback 會讓 iOS 主執行緒顫動 */
	const skipIo =
		typeof window.matchMedia === 'function' &&
		(window.matchMedia('(max-width: 900px)').matches ||
			window.matchMedia('(pointer: coarse)').matches);

	if (reduced || skipIo) {
		document.querySelectorAll('.reveal-on-scroll, .reveal-stagger').forEach((el) => {
			el.classList.add('is-revealed');
		});
		return;
	}

	const io = new IntersectionObserver((entries) => {
		for (const entry of entries) {
			if (!entry.isIntersecting) continue;
			entry.target.classList.add('is-revealed');
			io.unobserve(entry.target);
		}
	}, REVEAL_OPTS);

	document.querySelectorAll('.reveal-on-scroll').forEach((el) => {
		if (el.classList.contains('is-revealed')) return;
		if ((el as HTMLElement).dataset.revealBound === '1') return;
		(el as HTMLElement).dataset.revealBound = '1';
		io.observe(el);
	});

	document.querySelectorAll('.reveal-stagger').forEach((el) => {
		if (el.classList.contains('is-revealed')) return;
		if ((el as HTMLElement).dataset.revealBound === '1') return;
		(el as HTMLElement).dataset.revealBound = '1';
		io.observe(el);
	});
}
