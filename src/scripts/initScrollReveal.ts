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

	if (reduced) {
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

	const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches;

	document.querySelectorAll('.reveal-on-scroll').forEach((el) => {
		if (el.classList.contains('is-revealed')) return;
		if ((el as HTMLElement).dataset.revealBound === '1') return;
		(el as HTMLElement).dataset.revealBound = '1';
		/* 首頁手機：服務第一卡常在 IO 臨界下緣，延遲觸發會在標題下留空 — 直接進場 */
		if (
			isMobile &&
			el.matches('#home #services .services-grid .service-card.service-card--lead.reveal-on-scroll')
		) {
			el.classList.add('is-revealed');
			return;
		}
		io.observe(el);
	});

	document.querySelectorAll('.reveal-stagger').forEach((el) => {
		if (el.classList.contains('is-revealed')) return;
		if ((el as HTMLElement).dataset.revealBound === '1') return;
		(el as HTMLElement).dataset.revealBound = '1';
		io.observe(el);
	});
}
