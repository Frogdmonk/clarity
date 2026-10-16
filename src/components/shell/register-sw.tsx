"use client";
import { useEffect } from "react";

/** Offline shell only: the service worker never caches API/Supabase responses. */
export function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* PWA is an enhancement; ignore */
    });
  }, []);
  return null;
}
