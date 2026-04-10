import { applyBodyScrollLock, releaseBodyScrollLock } from './scrollLock';

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

  let promoLbAbort: AbortController | null = null;

  function initPromoLightbox() {
    promoLbAbort?.abort();
    promoLbAbort = new AbortController();
    const { signal } = promoLbAbort;

    const lb = document.getElementById('promoLightbox');
    const backdrop = document.getElementById('promoLbBackdrop');
    const closeBtn = document.getElementById('promoLbClose');
    const shell = document.getElementById('promoLbShell');
    const lbImg = document.getElementById('promoLbImg');
    const counterEl = document.getElementById('promoLbCounter');
    const prevBtn = document.getElementById('promoLbPrev');
    const nextBtn = document.getElementById('promoLbNext');
    const pageRoot = document.getElementById('promoPageRoot');
    if (!lb || !backdrop || !closeBtn || !shell || !lbImg || !(lbImg instanceof HTMLImageElement) || !pageRoot) return;

    const swipeAllowed = () =>
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(pointer: coarse)').matches;

    const getTriggerSrc = (btn: HTMLElement): string => {
      const d = btn.getAttribute('data-src')?.trim();
      if (d) return d;
      const img = btn.querySelector('img');
      if (img instanceof HTMLImageElement) {
        const u = (img.currentSrc || img.src || '').trim();
        if (u) return u;
      }
      return '';
    };

    const collect = (): { src: string; alt: string }[] =>
      Array.from(pageRoot.querySelectorAll('[data-promo-lightbox-trigger]'))
        .map((el) => {
          if (!(el instanceof HTMLElement)) return null;
          const src = getTriggerSrc(el);
          if (!src) return null;
          return { src, alt: el.getAttribute('data-alt') || '' };
        })
        .filter((x): x is { src: string; alt: string } => x !== null);

    let gallery: { src: string; alt: string }[] = [];
    let index = 0;
    let open = false;
    let navigating = false;

    const reducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const clearLbImgVisualState = () => {
      lbImg.style.transition = '';
      lbImg.style.transform = '';
      lbImg.style.opacity = '';
      shell.classList.remove('is-dragging');
    };

    const springBackLbImg = () => {
      shell.classList.remove('is-dragging');
      if (reducedMotion) {
        clearLbImgVisualState();
        return;
      }
      lbImg.style.transition =
        'transform 0.26s cubic-bezier(0.25, 0.88, 0.4, 1), opacity 0.2s ease-out';
      lbImg.style.transform = 'translate3d(0, 0, 0) scale(1)';
      lbImg.style.opacity = '1';
      const onSpringEnd = (e: TransitionEvent) => {
        if (e.target !== lbImg || e.propertyName !== 'transform') return;
        lbImg.removeEventListener('transitionend', onSpringEnd);
        clearLbImgVisualState();
      };
      lbImg.addEventListener('transitionend', onSpringEnd);
    };

    const playSwap = (direction: 'next' | 'prev') => {
      if (gallery.length < 2) return;
      if (reducedMotion) {
        clearLbImgVisualState();
        if (direction === 'next') showNext();
        else showPrev();
        return;
      }
      if (navigating) return;
      navigating = true;
      shell.classList.remove('is-dragging');
      const w = Math.min(window.innerWidth * 0.48, 480);
      const exitX = direction === 'next' ? -w : w;
      lbImg.style.transition =
        'transform 0.2s cubic-bezier(0.45, 0, 0.75, 1), opacity 0.16s ease-out';
      lbImg.style.transform = `translate3d(${exitX}px, 0, 0) scale(0.97)`;
      lbImg.style.opacity = '0.55';

      const onExitEnd = (e: TransitionEvent) => {
        if (e.target !== lbImg || e.propertyName !== 'transform') return;
        lbImg.removeEventListener('transitionend', onExitEnd);
        if (direction === 'next') showNext();
        else showPrev();
        lbImg.style.transition = 'none';
        lbImg.style.transform = `translate3d(${-exitX}px, 0, 0) scale(0.97)`;
        lbImg.style.opacity = '0.72';
        void lbImg.offsetHeight;
        lbImg.style.transition =
          'transform 0.3s cubic-bezier(0.22, 1, 0.32, 1), opacity 0.24s ease-out';
        lbImg.style.transform = 'translate3d(0, 0, 0) scale(1)';
        lbImg.style.opacity = '1';
        const onEnterEnd = (e: TransitionEvent) => {
          if (e.target !== lbImg || e.propertyName !== 'transform') return;
          lbImg.removeEventListener('transitionend', onEnterEnd);
          clearLbImgVisualState();
          navigating = false;
        };
        lbImg.addEventListener('transitionend', onEnterEnd);
      };
      lbImg.addEventListener('transitionend', onExitEnd);
    };

    const updateLbNavVisibility = () => {
      const show =
        open && gallery.length >= 2 && !swipeAllowed();
      if (prevBtn instanceof HTMLButtonElement) prevBtn.hidden = !show;
      if (nextBtn instanceof HTMLButtonElement) nextBtn.hidden = !show;
    };

    const render = () => {
      const item = gallery[index];
      if (!item) return;
      lbImg.alt = item.alt;
      lbImg.src = item.src;
      if (counterEl) {
        counterEl.textContent = `${index + 1} / ${gallery.length}`;
        counterEl.hidden = false;
      }
      updateLbNavVisibility();
    };

    const close = () => {
      if (!open) return;
      open = false;
      navigating = false;
      clearLbImgVisualState();
      lb.hidden = true;
      lb.setAttribute('aria-hidden', 'true');
      releaseBodyScrollLock();
      lbImg.removeAttribute('src');
      lbImg.alt = '';
      if (counterEl) {
        counterEl.textContent = '';
        counterEl.hidden = true;
      }
      updateLbNavVisibility();
    };

    const showNext = () => {
      if (gallery.length < 2) return;
      index = (index + 1) % gallery.length;
      render();
    };

    const showPrev = () => {
      if (gallery.length < 2) return;
      index = (index - 1 + gallery.length) % gallery.length;
      render();
    };

    const openAt = (i: number) => {
      gallery = collect();
      if (!gallery.length) return;
      index = Math.max(0, Math.min(i, gallery.length - 1));
      open = true;
      navigating = false;
      render();
      clearLbImgVisualState();
      lb.hidden = false;
      lb.setAttribute('aria-hidden', 'false');
      applyBodyScrollLock();
      closeBtn.focus({ preventScroll: true });
    };

    pageRoot.addEventListener(
      'click',
      (e) => {
        const t = e.target;
        if (!(t instanceof Element)) return;
        const btn = t.closest('[data-promo-lightbox-trigger]');
        if (!btn || !(btn instanceof HTMLElement) || !pageRoot.contains(btn)) return;
        e.preventDefault();
        const i = Number(btn.getAttribute('data-index') || '0');
        openAt(i);
      },
      { signal }
    );

    backdrop.addEventListener('click', () => close(), { signal });
    closeBtn.addEventListener('click', () => close(), { signal });

    if (prevBtn instanceof HTMLButtonElement) {
      prevBtn.addEventListener(
        'click',
        (e) => {
          e.stopPropagation();
          playSwap('prev');
        },
        { signal }
      );
    }
    if (nextBtn instanceof HTMLButtonElement) {
      nextBtn.addEventListener(
        'click',
        (e) => {
          e.stopPropagation();
          playSwap('next');
        },
        { signal }
      );
    }

    document.addEventListener(
      'keydown',
      (e) => {
        if (!open) return;
        if (e.key === 'Escape') {
          e.preventDefault();
          close();
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          playSwap('next');
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          playSwap('prev');
        }
      },
      { signal }
    );

    const SWIPE_MIN_PX = 42;
    const SWIPE_DOMINANCE = 1.1;
    /** 略大於 1：圖片比手指多移一點，跟手更俐落、少「拖著重物」感 */
    const DRAG_FOLLOW = 1.14;
    let swipePointerId: number | null = null;
    let swipeStartX = 0;
    let swipeStartY = 0;

    const applyDragVisual = (dx: number) => {
      lbImg.style.transition = 'none';
      lbImg.style.transform = `translate3d(${dx * DRAG_FOLLOW}px, 0, 0)`;
      lbImg.style.opacity = '';
    };

    const endSwipePointer = (e: PointerEvent, cancelled: boolean) => {
      if (!swipeAllowed()) return;
      if (swipePointerId !== e.pointerId) return;
      swipePointerId = null;
      try {
        shell.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      if (!open || gallery.length < 2) {
        clearLbImgVisualState();
        return;
      }
      if (cancelled || navigating) {
        springBackLbImg();
        return;
      }
      const dx = e.clientX - swipeStartX;
      const dy = e.clientY - swipeStartY;
      if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * SWIPE_DOMINANCE) {
        springBackLbImg();
        return;
      }
      playSwap(dx < 0 ? 'next' : 'prev');
    };

    shell.addEventListener(
      'pointerdown',
      (e: PointerEvent) => {
        if (!swipeAllowed()) return;
        if (!open || gallery.length < 2 || navigating) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        swipePointerId = e.pointerId;
        swipeStartX = e.clientX;
        swipeStartY = e.clientY;
        shell.classList.remove('is-dragging');
        shell.setPointerCapture(e.pointerId);
      },
      { signal, passive: true }
    );

    shell.addEventListener(
      'pointermove',
      (e: PointerEvent) => {
        if (!swipeAllowed()) return;
        if (swipePointerId !== e.pointerId || !open || gallery.length < 2 || navigating) return;
        const dx = e.clientX - swipeStartX;
        const dy = e.clientY - swipeStartY;
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        shell.classList.add('is-dragging');
        applyDragVisual(dx);
      },
      { signal, passive: true }
    );

    shell.addEventListener(
      'pointerup',
      (e: PointerEvent) => endSwipePointer(e, false),
      { signal, passive: true }
    );
    shell.addEventListener(
      'pointercancel',
      (e: PointerEvent) => endSwipePointer(e, true),
      { signal, passive: true }
    );
    shell.addEventListener(
      'lostpointercapture',
      (e: PointerEvent) => {
        if (!swipeAllowed()) return;
        if (swipePointerId === e.pointerId && shell.classList.contains('is-dragging')) {
          swipePointerId = null;
          springBackLbImg();
        }
      },
      { signal }
    );
  }

  initPromoLightbox();
  const gLbNav = globalThis as typeof globalThis & { __aqPromoLbNav?: boolean };
  if (!gLbNav.__aqPromoLbNav) {
    gLbNav.__aqPromoLbNav = true;
    document.addEventListener('astro:page-load', initPromoLightbox);
  }
}
