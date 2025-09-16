import { useEffect } from 'react';

// Track nested locks so multiple modals can coexist safely
let lockCount = 0;
let savedScrollY = 0;
let prevOverflow = '';
let prevPaddingRight = '';
let prevPosition = '';
let prevTop = '';
let prevWidth = '';

function getScrollbarWidth() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return 0;
  return window.innerWidth - document.documentElement.clientWidth;
}

export default function useBodyScrollLock(locked) {
  useEffect(() => {
    if (!locked || typeof document === 'undefined') return;

    const body = document.body;
    lockCount += 1;

    if (lockCount === 1) {
      // Immediately save current scroll position to prevent any race conditions
      savedScrollY = window.scrollY || window.pageYOffset || 0;
      
      // Save current styles
      prevOverflow = body.style.overflow;
      prevPaddingRight = body.style.paddingRight;
      prevPosition = body.style.position;
      prevTop = body.style.top;
      prevWidth = body.style.width;

      const scrollbarWidth = getScrollbarWidth();
      if (scrollbarWidth > 0) {
        const currentPad = parseInt(prevPaddingRight || '0', 10) || 0;
        body.style.paddingRight = `${currentPad + scrollbarWidth}px`;
      }

      // Lock scroll immediately without losing current position
      body.style.overflow = 'hidden';
      body.style.position = 'fixed';
      body.style.top = `-${savedScrollY}px`;
      body.style.width = '100%';
      body.setAttribute('data-scroll-locked', 'true');
    }

    return () => {
      lockCount -= 1;
      if (lockCount <= 0) {
        // Restore styles and scroll position
        const body = document.body;
        body.style.overflow = prevOverflow;
        body.style.paddingRight = prevPaddingRight;
        body.style.position = prevPosition;
        body.style.top = prevTop;
        body.style.width = prevWidth;
        body.removeAttribute('data-scroll-locked');
        window.scrollTo(0, savedScrollY || 0);
        lockCount = 0;
      }
    };
  }, [locked]);
}

