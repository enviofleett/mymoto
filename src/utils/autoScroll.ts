/**
 * Shared Auto-Scroll Utility
 * Extracts duplicate auto-scroll logic from chat components
 */

import { RefObject, useEffect } from 'react';

/**
 * Auto-scrolls to bottom when dependencies change
 * @param scrollRef - Ref to the scroll target element
 * @param dependencies - Array of dependencies to watch for changes
 * @param behavior - Scroll behavior ('smooth' | 'auto')
 */
export function useAutoScroll(
  scrollRef: RefObject<HTMLElement>,
  dependencies: unknown[],
  behavior: ScrollBehavior = 'smooth'
): void {
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior });
    }
  }, dependencies);
}

/**
 * Scrolls to bottom immediately (non-hook version)
 * Useful for imperative scrolling
 */
export function scrollToBottom(
  element: HTMLElement | null,
  behavior: ScrollBehavior = 'smooth'
): void {
  if (element) {
    element.scrollIntoView({ behavior });
  }
}
