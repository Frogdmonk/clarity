"use client";
import { useEffect } from "react";
import { heartbeat } from "@/lib/rpc/rpc";

/** last_seen_at at most every 60 s, only while the tab is visible (not on every focus). */
export function useHeartbeat(sessionId: string | undefined, enabled = true): void {
  useEffect(() => {
    if (!sessionId || !enabled) return;
    const beat = () => {
      if (document.visibilityState === "visible") heartbeat(sessionId).catch(() => {});
    };
    beat();
    const id = setInterval(beat, 60_000);
    return () => clearInterval(id);
  }, [sessionId, enabled]);
}
