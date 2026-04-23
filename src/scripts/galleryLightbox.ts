import { applyBodyScrollLock, releaseBodyScrollLock } from './scrollLock';

export type GalleryItem = { src: string; alt: string };

type Options = {
  pageRootSelector: string;
  triggerSelector: string;
  ignoreSelector?: string;
  /** 若沒有 data-index，可提供用 trigger 計算 index 的函式 */
  indexOfTrigger?: (trigger: HTMLElement) => number;
  /** 取得整個 gallery（每次 open 重新收集，確保順序即時） */
  collectItems: () => GalleryItem[];

  lightboxId: string;
  backdropId: string;
  closeBtnId: string;
  shellId: string;
  imgId: string;
  counterId?: string;
  prevBtnId?: string;
  nextBtnId?: string;

  wheelDismiss?: boolean;
  wheelDismissThreshold?: number;
  swipeDownDismiss?: boolean;
};

function el<T extends Element>(id: string): T | null {
  const n = document.getElementById(id);
  return (n instanceof Element ? (n as T) : null);
}

export function setupGalleryLightbox(opts: Options): void {
  const pageRoot = document.querySelector(opts.pageRootSelector);
  if (!(pageRoot instanceof HTMLElement)) return;

  const lb = el<HTMLElement>(opts.lightboxId);
  const backdrop = el<HTMLButtonElement>(opts.backdropId);
  const closeBtn = el<HTMLButtonElement>(opts.closeBtnId);
  const shell = el<HTMLElement>(opts.shellId);
  const lbImg = el<HTMLImageElement>(opts.imgId);
  const counterEl = opts.counterId ? el<HTMLElement>(opts.counterId) : null;
  const prevBtn = opts.prevBtnId ? el<HTMLButtonElement>(opts.prevBtnId) : null;
  const nextBtn = opts.nextBtnId ? el<HTMLButtonElement>(opts.nextBtnId) : null;
  if (!lb || !backdrop || !closeBtn || !shell || !lbImg) return;

  if (pageRoot.dataset.galleryLbBound === '1') return;
  pageRoot.dataset.galleryLbBound = '1';

  const swipeAllowed = () =>
    typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  const reducedMotion =
    typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let gallery: GalleryItem[] = [];
  let index = 0;
  let open = false;
  let navigating = false;
  let wheelSum = 0;
  let navToken = 0;
  let navTimer: ReturnType<typeof window.setTimeout> | null = null;

  const clearNavTimer = () => {
    if (navTimer) {
      window.clearTimeout(navTimer);
      navTimer = null;
    }
  };

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
    lbImg.style.transition = 'transform 0.26s cubic-bezier(0.25, 0.88, 0.4, 1), opacity 0.2s ease-out';
    lbImg.style.transform = 'translate3d(0, 0, 0) scale(1)';
    lbImg.style.opacity = '1';
    const onSpringEnd = (e: TransitionEvent) => {
      if (e.target !== lbImg || e.propertyName !== 'transform') return;
      lbImg.removeEventListener('transitionend', onSpringEnd);
      clearLbImgVisualState();
    };
    lbImg.addEventListener('transitionend', onSpringEnd);
  };

  const updateLbNavVisibility = () => {
    const show = open && gallery.length >= 2 && !swipeAllowed();
    if (prevBtn) prevBtn.hidden = !show;
    if (nextBtn) nextBtn.hidden = !show;
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

  const finalizeClose = () => {
    open = false;
    navigating = false;
    wheelSum = 0;
    navToken += 1;
    clearNavTimer();
    clearLbImgVisualState();
    lb.classList.remove('is-closing');
    lb.classList.remove('is-closing-swipe');
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

  const close = ({ animate = true, dismissSwipe = false, dismissDy = 0, dismissVy = 0 } = {}) => {
    if (!open) return;
    if (reducedMotion) animate = false;
    if (lb.classList.contains('is-closing')) return;

    if (!animate) {
      finalizeClose();
      return;
    }

    lb.classList.toggle('is-closing-swipe', Boolean(dismissSwipe));
    lb.classList.add('is-closing');
    navigating = true;
    if (!dismissSwipe) {
      clearLbImgVisualState();
    } else {
      shell.classList.remove('is-dragging');
      const inertia = Math.max(0, Math.min(dismissVy * 220, 220));
      const targetDy = Math.max(140, dismissDy * DRAG_FOLLOW + inertia);
      lbImg.style.transition = 'transform 0.24s cubic-bezier(0.12, 0.82, 0.26, 1), opacity 0.22s ease-out';
      lbImg.style.transform = `translate3d(0, ${targetDy}px, 0) scale(0.97)`;
      lbImg.style.opacity = '0';
    }

    const token = ++navToken;
    clearNavTimer();
    navTimer = window.setTimeout(() => {
      if (navToken !== token) return;
      finalizeClose();
    }, 260);

    const onDone = (e: TransitionEvent) => {
      if (e.target !== lb) return;
      lb.removeEventListener('transitionend', onDone);
      if (navToken !== token) return;
      finalizeClose();
    };
    lb.addEventListener('transitionend', onDone);
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
    navToken += 1;
    const token = navToken;
    let swapped = false;
    clearNavTimer();
    // Fallback: if transitionend is lost (fast swipes / iOS), recover navigation state.
    navTimer = window.setTimeout(() => {
      if (!open) return;
      if (navToken !== token) return;
      // Ensure we still advance at least once (prevents "same image" on lost transitionend).
      if (!swapped) {
        if (direction === 'next') showNext();
        else showPrev();
      }
      navigating = false;
      clearLbImgVisualState();
    }, 900);
    shell.classList.remove('is-dragging');
    const w = Math.min(window.innerWidth * 0.48, 480);
    const exitX = direction === 'next' ? -w : w;
    lbImg.style.transition = 'transform 0.2s cubic-bezier(0.45, 0, 0.75, 1), opacity 0.16s ease-out';
    lbImg.style.transform = `translate3d(${exitX}px, 0, 0) scale(0.97)`;
    lbImg.style.opacity = '0.55';

    const onExitEnd = (e: TransitionEvent) => {
      if (e.target !== lbImg || e.propertyName !== 'transform') return;
      lbImg.removeEventListener('transitionend', onExitEnd);
      if (!open || navToken !== token) return;
      swapped = true;
      if (direction === 'next') showNext();
      else showPrev();
      lbImg.style.transition = 'none';
      lbImg.style.transform = `translate3d(${-exitX}px, 0, 0) scale(0.97)`;
      lbImg.style.opacity = '0.72';
      void lbImg.offsetHeight;
      lbImg.style.transition = 'transform 0.3s cubic-bezier(0.22, 1, 0.32, 1), opacity 0.24s ease-out';
      lbImg.style.transform = 'translate3d(0, 0, 0) scale(1)';
      lbImg.style.opacity = '1';
      const onEnterEnd = (e: TransitionEvent) => {
        if (e.target !== lbImg || e.propertyName !== 'transform') return;
        lbImg.removeEventListener('transitionend', onEnterEnd);
        if (!open || navToken !== token) return;
        clearLbImgVisualState();
        navigating = false;
        clearNavTimer();
      };
      lbImg.addEventListener('transitionend', onEnterEnd);
    };
    lbImg.addEventListener('transitionend', onExitEnd);
  };

  const openAt = (i: number) => {
    gallery = opts.collectItems();
    if (!gallery.length) return;
    index = Math.max(0, Math.min(i, gallery.length - 1));
    open = true;
    navigating = false;
    wheelSum = 0;
    navToken += 1;
    clearNavTimer();
    render();
    clearLbImgVisualState();
    lb.hidden = false;
    lb.setAttribute('aria-hidden', 'false');
    applyBodyScrollLock();
    closeBtn.focus({ preventScroll: true });
  };

  pageRoot.addEventListener('click', (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    if (opts.ignoreSelector && t.closest(opts.ignoreSelector)) return;
    const trig = t.closest(opts.triggerSelector);
    if (!(trig instanceof HTMLElement) || !pageRoot.contains(trig)) return;
    e.preventDefault();
    const fromAttr = Number(trig.getAttribute('data-index') || '');
    const i = Number.isFinite(fromAttr) ? fromAttr : opts.indexOfTrigger ? opts.indexOfTrigger(trig) : 0;
    openAt(i);
  });

  backdrop.addEventListener('click', () => close({ animate: true }));
  closeBtn.addEventListener('click', () => close({ animate: true }));

  if (prevBtn) {
    prevBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      playSwap('prev');
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      playSwap('next');
    });
  }

  document.addEventListener('keydown', (e) => {
    if (!open) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      close({ animate: true });
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      playSwap('next');
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      playSwap('prev');
    }
  });

  // 觸控：左右滑切換 + 往下滑退出（與 promo 相同手感）
  const SWIPE_MIN_PX = 42;
  const SWIPE_DOMINANCE = 1.1;
  const DISMISS_MIN_PX = 78;
  const DISMISS_DOMINANCE = 1.2;
  const DRAG_FOLLOW = 1.14;
  let swipePointerId: number | null = null;
  let swipeStartX = 0;
  let swipeStartY = 0;
  let swipeLastX = 0;
  let swipeLastY = 0;
  let swipeLastT = 0;
  let swipeVy = 0;
  let gesture: 'swipe' | 'dismiss' | null = null;

  const applyDragVisual = (dx: number, dy: number) => {
    lbImg.style.transition = 'none';
    if (gesture === 'dismiss') {
      const followY = dy * DRAG_FOLLOW;
      const clamped = Math.max(0, Math.min(dy / 280, 0.6));
      lbImg.style.transform = `translate3d(0, ${followY}px, 0)`;
      lbImg.style.opacity = String(1 - clamped);
    } else {
      lbImg.style.transform = `translate3d(${dx * DRAG_FOLLOW}px, 0, 0)`;
      lbImg.style.opacity = '';
    }
  };

  const endSwipePointer = (e: PointerEvent, cancelled: boolean) => {
    if (!swipeAllowed()) return;
    if (swipePointerId !== e.pointerId) return;
    swipePointerId = null;
    const gestureAtEnd = gesture;
    gesture = null;
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
    if (opts.swipeDownDismiss !== false && gestureAtEnd === 'dismiss') {
      const speedDismiss = swipeVy > 0.55 && dy > 30;
      if ((dy > DISMISS_MIN_PX && Math.abs(dy) > Math.abs(dx) * DISMISS_DOMINANCE) || speedDismiss) {
        close({ animate: true, dismissSwipe: true, dismissDy: dy, dismissVy: swipeVy });
      }
      else springBackLbImg();
      return;
    }
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
      swipeLastX = e.clientX;
      swipeLastY = e.clientY;
      swipeLastT = e.timeStamp;
      swipeVy = 0;
      gesture = null;
      shell.classList.remove('is-dragging');
      shell.setPointerCapture(e.pointerId);
    },
    { passive: true }
  );

  shell.addEventListener(
    'pointermove',
    (e: PointerEvent) => {
      if (!swipeAllowed()) return;
      if (swipePointerId !== e.pointerId || !open || gallery.length < 2 || navigating) return;
      const dx = e.clientX - swipeStartX;
      const dy = e.clientY - swipeStartY;
      const dt = Math.max(1, e.timeStamp - swipeLastT);
      swipeVy = (e.clientY - swipeLastY) / dt;
      swipeLastX = e.clientX;
      swipeLastY = e.clientY;
      swipeLastT = e.timeStamp;
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      shell.classList.add('is-dragging');
      if (!gesture) {
        if (dy > 0 && Math.abs(dy) > Math.abs(dx) * DISMISS_DOMINANCE) gesture = 'dismiss';
        else gesture = 'swipe';
      }
      applyDragVisual(dx, dy);
    },
    { passive: true }
  );

  shell.addEventListener('pointerup', (e) => endSwipePointer(e, false), { passive: true });
  shell.addEventListener('pointercancel', (e) => endSwipePointer(e, true), { passive: true });
  shell.addEventListener('lostpointercapture', (e: PointerEvent) => {
    if (!swipeAllowed()) return;
    if (swipePointerId === e.pointerId && shell.classList.contains('is-dragging')) {
      swipePointerId = null;
      gesture = null;
      springBackLbImg();
    }
  });

  if (opts.wheelDismiss) {
    lb.addEventListener(
      'wheel',
      (e: WheelEvent) => {
        if (!open) return;
        if (Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
        if (e.deltaY <= 0) return;
        wheelSum += e.deltaY;
        if (wheelSum > (opts.wheelDismissThreshold ?? 140)) close({ animate: true });
      },
      { passive: true }
    );
  }
}

