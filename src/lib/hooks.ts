import { useCallback, useEffect, useRef, useState } from "react";

/** Smoothly animates a number towards its target (stat counters). */
export function useCountUp(target: number, duration = 700): number {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = fromRef.current;
    if (from === target) return;
    const started = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = from + (target - from) * eased;
      setValue(next);
      if (t < 1) rafRef.current = requestAnimationFrame(step);
      else fromRef.current = target;
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      fromRef.current = value;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);

  return value;
}

/** Re-renders on an interval so relative timestamps stay honest. */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

export interface RevealApi<T extends HTMLElement> {
  ref: (node: T | null) => void;
  visible: boolean;
}

/** Scroll reveal — adds `.is-visible` once the node enters the viewport. */
export function useReveal<T extends HTMLElement = HTMLDivElement>(delayMs = 0): RevealApi<T> {
  const [visible, setVisible] = useState(false);
  const nodeRef = useRef<T | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const ref = useCallback((node: T | null) => {
    nodeRef.current = node;
    observerRef.current?.disconnect();
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            if (delayMs) setTimeout(() => setVisible(true), delayMs);
            else setVisible(true);
            observerRef.current?.disconnect();
          }
        }
      },
      { threshold: 0.08, rootMargin: "0px 0px -40px 0px" },
    );
    observerRef.current.observe(node);
  }, [delayMs]);

  useEffect(() => () => observerRef.current?.disconnect(), []);

  return { ref, visible };
}

/** Registers global keyboard shortcuts. */
export function useHotkeys(map: Record<string, (e: KeyboardEvent) => void>): void {
  const ref = useRef(map);
  ref.current = map;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable || target.tagName === "SELECT");

      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      const combo = [
        mod ? "mod" : null,
        e.shiftKey ? "shift" : null,
        e.altKey ? "alt" : null,
        typing && key !== "escape" && !mod ? null : key,
      ]
        .filter(Boolean)
        .join("+");

      const fn = ref.current[combo];
      if (fn) {
        fn(e);
        return;
      }
      if (typing) return;
      const bare = ref.current[key];
      if (bare) bare(e);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
}

/** Media element helpers: keeps a blob URL alive for the session. */
export function useObjectUrl(file: File | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }
    const created = URL.createObjectURL(file);
    setUrl(created);
    return () => URL.revokeObjectURL(created);
  }, [file]);
  return url;
}
