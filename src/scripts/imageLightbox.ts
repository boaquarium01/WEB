import { applyBodyScrollLock, releaseBodyScrollLock } from './scrollLock';

type SetupOptions = {
  /** 要綁 click 的容器（可以是 pageRoot / gallery root / carousel root） */
  groupSelector: string;
  /** group 內，會觸發開啟 lightbox 的節點 */
  triggerSelector: string;
  /** 若命中此 selector（或其祖先），則忽略本次觸發（例如 carousel nav/dots） */
  ignoreSelector?: string;
  lightboxId: string;
  backdropId: string;
  imgId: string;
  /** 往下滾動（桌機）累積超過門檻關閉 */
  wheelDismiss?: boolean;
  wheelDismissThreshold?: number;
  /** 觸控：往下拖超過門檻關閉 */
  swipeDownDismiss?: boolean;
  swipeDownMinPx?: number;
  swipeDownDominance?: number;
};

function closestEl(from: Element, selector: string): Element | null {
  try {
    return from.closest(selector);
  } catch {
    return null;
  }
}

export function setupImageLightbox(options: SetupOptions): void {
  const {
    groupSelector,
    triggerSelector,
    ignoreSelector,
    lightboxId,
    backdropId,
    imgId,
    wheelDismiss = false,
    wheelDismissThreshold = 140,
    swipeDownDismiss = false,
    swipeDownMinPx = 78,
    swipeDownDominance = 1.2
  } = options;

  const lightbox = document.getElementById(lightboxId);
  const backdrop = document.getElementById(backdropId);
  const lbImg = document.getElementById(imgId);
  if (!(lightbox instanceof HTMLElement)) return;
  if (!(backdrop instanceof HTMLElement)) return;
  if (!(lbImg instanceof HTMLImageElement)) return;

  let open = false;
  let wheelSum = 0;

  const clearVisual = () => {
    lbImg.style.transition = '';
    lbImg.style.transform = '';
    lbImg.style.opacity = '';
  };

  const close = () => {
    if (!open) return;
    open = false;
    wheelSum = 0;
    clearVisual();
    lightbox.hidden = true;
    lightbox.setAttribute('aria-hidden', 'true');
    releaseBodyScrollLock();
    lbImg.removeAttribute('src');
    lbImg.alt = '';
  };

  const openFromImg = (img: HTMLImageElement) => {
    const src = (img.currentSrc || img.src || '').trim();
    if (!src) return;
    lbImg.alt = img.alt || '';
    lbImg.src = src;
    open = true;
    wheelSum = 0;
    clearVisual();
    lightbox.hidden = false;
    lightbox.setAttribute('aria-hidden', 'false');
    applyBodyScrollLock();
    backdrop.focus({ preventScroll: true });
  };

  document.querySelectorAll(groupSelector).forEach((root) => {
    if (!(root instanceof HTMLElement)) return;
    if (root.dataset.lightboxBound === '1') return;
    root.dataset.lightboxBound = '1';

    root.addEventListener('click', (e) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (ignoreSelector && closestEl(t, ignoreSelector)) return;
      const trig = closestEl(t, triggerSelector);
      if (!(trig instanceof HTMLElement) || !root.contains(trig)) return;

      const img = trig.querySelector('img');
      if (!(img instanceof HTMLImageElement)) return;
      e.preventDefault();
      openFromImg(img);
    });
  });

  if (lightbox.dataset.lightboxGlobalBound === '1') return;
  lightbox.dataset.lightboxGlobalBound = '1';

  backdrop.addEventListener('click', () => close());

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && open) {
      e.preventDefault();
      close();
    }
  });

  if (wheelDismiss) {
    lightbox.addEventListener(
      'wheel',
      (e: WheelEvent) => {
        if (!open) return;
        if (Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
        if (e.deltaY <= 0) return;
        wheelSum += e.deltaY;
        if (wheelSum > wheelDismissThreshold) close();
      },
      { passive: true }
    );
  }

  if (swipeDownDismiss) {
    const swipeAllowed = () =>
      typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;

    const DRAG_FOLLOW = 1.1;
    let pointerId: number | null = null;
    let startX = 0;
    let startY = 0;

    const springBack = () => {
      clearVisual();
    };

    lightbox.addEventListener(
      'pointerdown',
      (e: PointerEvent) => {
        if (!swipeAllowed()) return;
        if (!open) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        pointerId = e.pointerId;
        startX = e.clientX;
        startY = e.clientY;
        try {
          lightbox.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      },
      { passive: true }
    );

    lightbox.addEventListener(
      'pointermove',
      (e: PointerEvent) => {
        if (!swipeAllowed()) return;
        if (!open) return;
        if (pointerId !== e.pointerId) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (dy <= 0) return;
        if (Math.abs(dy) < 6 && Math.abs(dx) < 6) return;
        if (Math.abs(dy) < Math.abs(dx) * swipeDownDominance) return;
        lbImg.style.transition = 'none';
        const clamped = Math.max(0, Math.min(dy / 280, 0.6));
        lbImg.style.transform = `translate3d(0, ${dy * DRAG_FOLLOW}px, 0)`;
        lbImg.style.opacity = String(1 - clamped);
      },
      { passive: true }
    );

    const end = (e: PointerEvent, cancelled: boolean) => {
      if (!swipeAllowed()) return;
      if (pointerId !== e.pointerId) return;
      pointerId = null;
      try {
        lightbox.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      if (!open) return;
      if (cancelled) {
        springBack();
        return;
      }
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (dy > swipeDownMinPx && Math.abs(dy) > Math.abs(dx) * swipeDownDominance) close();
      else springBack();
    };

    lightbox.addEventListener('pointerup', (e) => end(e, false), { passive: true });
    lightbox.addEventListener('pointercancel', (e) => end(e, true), { passive: true });
  }
}

