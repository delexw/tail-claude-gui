import { useRef, useEffect } from "react";

export function useScrollToSelected(dep: number) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let container = el.parentElement;
    while (container && container !== document.body) {
      const style = window.getComputedStyle(container);
      if (
        style.overflowY === "auto" ||
        style.overflowY === "scroll" ||
        style.overflow === "auto" ||
        style.overflow === "scroll"
      ) {
        break;
      }
      container = container.parentElement;
    }

    const containerHeight =
      container && container !== document.body ? container.clientHeight : window.innerHeight;

    // Use getBoundingClientRect to determine if the element is above the viewport
    const elRect = el.getBoundingClientRect();
    const containerRect =
      container && container !== document.body
        ? container.getBoundingClientRect()
        : new DOMRect(0, 0, window.innerWidth, window.innerHeight);

    // If the top of the element is above the container's top, we MUST align it to the top.
    // This happens when navigating UP to an element that is taller than the viewport.
    // "nearest" would align its bottom, leaving the top hidden.
    if (elRect.top < containerRect.top) {
      el.scrollIntoView({ block: "start" });
    } else if (elRect.bottom > containerRect.bottom) {
      // If it's below the container, we use "nearest" to bring it into view.
      // But if it's taller than the container, we still want to see its top edge (the header).
      if (el.offsetHeight > containerHeight) {
        el.scrollIntoView({ block: "start" });
      } else {
        el.scrollIntoView({ block: "nearest" });
      }
    } else {
      // Already fully visible (or fits exactly)
      // Do nothing, or just call nearest
      el.scrollIntoView({ block: "nearest" });
    }
  }, [dep]);

  return ref;
}
