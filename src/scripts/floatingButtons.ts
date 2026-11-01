/**
 * 浮動購物車／LINE 按鈕：
 * 1. 量測頁面底部固定操作列（商品頁加入購物車列、購物車結帳列、結帳送出列）高度，
 *    寫入 --float-offset，讓浮動鈕停在操作列上方而不是蓋住它。
 * 2. 只在 <html data-float-tuck="1"> 的頁面（結帳、會員中心）：
 *    手機寬度往下捲動時收起浮動鈕，往上捲動或回到頂端時再出現。
 */

const BOTTOM_BAR_SELECTORS = [
	'.purchase-dock:not([hidden])',
	'.cart-page .summary',
	'.summary',
	'.checkout .actions',
	'[data-bottom-bar]',
].join(',');

const MOBILE_QUERY = '(max-width: 639px)';
const SCROLL_DELTA = 8;
const TOP_ZONE = 120;

let lastY = 0;
let ticking = false;
let started = false;

function measureBottomBar(): void {
	const viewportHeight = window.innerHeight;
	let offset = 0;
	document.querySelectorAll<HTMLElement>(BOTTOM_BAR_SELECTORS).forEach((el) => {
		const style = getComputedStyle(el);
		if (style.position !== 'fixed' || style.display === 'none' || style.visibility === 'hidden') return;
		const rect = el.getBoundingClientRect();
		if (rect.height === 0 || rect.bottom < viewportHeight - 2) return;
		offset = Math.max(offset, Math.round(viewportHeight - rect.top));
	});
	document.documentElement.style.setProperty('--float-offset', `${offset}px`);
}

function onScroll(): void {
	if (ticking) return;
	ticking = true;
	requestAnimationFrame(() => {
		ticking = false;
		const y = window.scrollY;
		const root = document.documentElement;
		const tuckEnabled = root.dataset.floatTuck === '1';
		if (!tuckEnabled || !window.matchMedia(MOBILE_QUERY).matches || y < TOP_ZONE) {
			root.classList.remove('floats-tucked');
		} else if (y > lastY + SCROLL_DELTA) {
			root.classList.add('floats-tucked');
		} else if (y < lastY - SCROLL_DELTA) {
			root.classList.remove('floats-tucked');
		}
		if (Math.abs(y - lastY) > SCROLL_DELTA) lastY = y;
	});
}

export function initFloatingButtons(): void {
	const refresh = () => {
		lastY = window.scrollY;
		document.documentElement.classList.remove('floats-tucked');
		measureBottomBar();
	};
	refresh();
	if (started) return;
	started = true;

	window.addEventListener('scroll', onScroll, { passive: true });
	window.addEventListener('resize', measureBottomBar, { passive: true });
	document.addEventListener('astro:page-load', refresh);

	// 操作列可能在之後才出現（規格面板、hidden 屬性切換），觀察 DOM 變化後重新量測
	let pending = 0;
	const observer = new MutationObserver(() => {
		cancelAnimationFrame(pending);
		pending = requestAnimationFrame(measureBottomBar);
	});
	observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['hidden', 'class'], childList: true });
}
