import { useRef, useEffect, useLayoutEffect, type RefObject } from "react";

/**
 * Auto-scrolls a container to the bottom when `itemCount` increases,
 * but only if the user was already near the bottom before the update.
 *
 * Near-bottom state is tracked via scroll events (which fire before new
 * content is rendered), so the check isn't thrown off by new items
 * pushing scrollHeight up.
 */
export function useAutoScroll<T extends HTMLElement>(
  itemCount: number,
  existingRef?: RefObject<T | null>,
  threshold = 150,
) {
  const ownRef = useRef<T>(null);
  const ref = existingRef ?? ownRef;
  const prevCountRef = useRef(itemCount);
  const isNearBottomRef = useRef(true);

  // Track near-bottom state via scroll events. Attached once when
  // the element is available — scroll events keep the ref up to date.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const checkNearBottom = () => {
      isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    };

    // Capture initial state.
    checkNearBottom();

    el.addEventListener("scroll", checkNearBottom, { passive: true });
    return () => el.removeEventListener("scroll", checkNearBottom);
  }, [ref, threshold]);

  // When items increase, scroll before paint if user was near bottom.
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && itemCount > prevCountRef.current && isNearBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
    prevCountRef.current = itemCount;
  }, [itemCount, ref]);

  return ref;
}
