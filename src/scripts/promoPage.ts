import { setupGalleryLightbox } from './galleryLightbox';

const PROMO_SCROLL_FLAG = '__aqPromoScrollBound';

/**
 * 促銷分頁：回到頂部鈕 + 圖片 lightbox（須由頁面內含 #promoPageRoot、#promoLightbox 等節點）
 */
export function mountPromoPage(): void {
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
