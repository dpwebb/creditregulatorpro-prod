import { useCallback } from "react";

let observer: IntersectionObserver | null = null;
const callbacks = new WeakMap<Element, () => void>();

function getObserver() {
  if (typeof window === "undefined") return null;
  if (!observer) {
    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const cb = callbacks.get(entry.target);
            if (cb) cb();
            observer?.unobserve(entry.target);
            callbacks.delete(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
    );
  }
  return observer;
}

/**
 * A helper to trigger one-shot scroll reveal animations.
 * Returns a ref callback to attach to elements you want to reveal.
 * The element will receive a `data-revealed="true"` attribute when it enters the viewport.
 */
export function useScrollReveal() {
  return useCallback((node: HTMLElement | null) => {
    if (node && !node.dataset.revealed) {
      const obs = getObserver();
      if (obs) {
        if (!callbacks.has(node)) {
          callbacks.set(node, () => {
            node.dataset.revealed = "true";
          });
          obs.observe(node);
        }
      }
    }
  }, []);
}