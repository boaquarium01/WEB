import { setupGalleryLightbox } from './galleryLightbox';
import { initScrollReveal } from './initScrollReveal';

const PROMO_SCROLL_FLAG = '__aqPromoScrollBound';

/**
 * 促銷分頁：回到頂部鈕 + 圖片 lightbox（須由頁面內含 #promoPageRoot、#promoLightbox 等節點）
 */
export function mountPromoPage(): void {
  // Ensure reveal-on-scroll is bound on this page (prevents invisible-but-clickable promo grid on some clients).
  initScrollReveal();
  // Fallback: if reveal observer doesn't fire (mobile WebView quirks), force-reveal above-the-fold blocks.
  const forceRevealAboveFold = () => {
    const els = Array.from(document.querySelectorAll('#promoPageRoot .reveal-on-scroll')) as HTMLElement[];
    if (!els.length) return;
    const vh = window.innerHeight || 0;
    for (const el of els) {
      if (el.classList.contains('is-revealed')) continue;
      const r = el.getBoundingClientRect();
      // In/near viewport → reveal to avoid permanent opacity:0
      if (r.bottom >= -40 && r.top <= vh + 40) el.classList.add('is-revealed');
    }
  };
  // Run once now and again after layout/async images settle.
  forceRevealAboveFold();
  window.setTimeout(forceRevealAboveFold, 220);

  const g = globalThis as unknown as Record<string, unknown>;
  if (!g[PROMO_SCROLL_FLAG]) {
    g[PROMO_SCROLL_FLAG] = true;
    const syncScrollTopBtn = () => {
      const btn = document.getElementById('promoScrollTopBtn');
      if (!(btn instanceof HTMLButtonElement)) return;
      if (window.scrollY > 240) btn.classList.add('is-visible');
      else btn.classList.remove('is-visible');
    };
    syncScrollTopBtn();
    window.addEventListener('scroll', syncScrollTopBtn, { passive: true });
    document.addEventListener('astro:page-load', syncScrollTopBtn);
    document.addEventListener('astro:page-load', () => initScrollReveal());
    document.addEventListener('astro:page-load', () => {
      initScrollReveal();
      forceRevealAboveFold();
      window.setTimeout(forceRevealAboveFold, 220);
    });
    document.addEventListener(
      'click',
      (e) => {
        const t = e.target;
        if (!(t instanceof Element)) return;
        const btn = t.closest('#promoScrollTopBtn');
        if (btn instanceof HTMLButtonElement) {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      },
      true
    );
  }

  function initPromoLightbox() {
    setupGalleryLightbox({
      pageRootSelector: '#promoPageRoot',
      triggerSelector: '[data-promo-lightbox-trigger]',
      collectItems: () =>
        Array.from(document.querySelectorAll('#promoPageRoot [data-promo-lightbox-trigger]'))
          .map((el) => {
            if (!(el instanceof HTMLElement)) return null;
            const src = String(el.getAttribute('data-src') || '').trim();
            if (!src) return null;
            return { src, alt: el.getAttribute('data-alt') || '' };
          })
          .filter((x): x is { src: string; alt: string } => x !== null),
      lightboxId: 'promoLightbox',
      backdropId: 'promoLbBackdrop',
      closeBtnId: 'promoLbClose',
      shellId: 'promoLbShell',
      imgId: 'promoLbImg',
      counterId: 'promoLbCounter',
      prevBtnId: 'promoLbPrev',
      nextBtnId: 'promoLbNext',
      wheelDismiss: true,
      swipeDownDismiss: true
    });
  }

  initPromoLightbox();
  const gLbNav = globalThis as typeof globalThis & { __aqPromoLbNav?: boolean };
  if (!gLbNav.__aqPromoLbNav) {
    gLbNav.__aqPromoLbNav = true;
    document.addEventListener('astro:page-load', initPromoLightbox);
  }
}
