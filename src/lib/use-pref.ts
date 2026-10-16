"use client";
import { useCallback, useSyncExternalStore } from "react";

/** Light per-user UI preference in localStorage (never used for real data). SSR-safe. */
export function usePref(key: string, fallback: string): [string, (v: string) => void] {
  const subscribe = useCallback((cb: () => void) => {
    window.addEventListener("storage", cb);
    window.addEventListener(`pref:${key}`, cb);
    return () => {
      window.removeEventListener("storage", cb);
      window.removeEventListener(`pref:${key}`, cb);
    };
  }, [key]);
  const get = useCallback(() => {
    try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
  }, [key, fallback]);
  const value = useSyncExternalStore(subscribe, get, () => fallback);
  const set = useCallback((v: string) => {
    try { localStorage.setItem(key, v); } catch { /* private mode */ }
    window.dispatchEvent(new Event(`pref:${key}`));
  }, [key]);
  return [value, set];
}
