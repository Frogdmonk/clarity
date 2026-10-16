"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { backoffDelay, isStale } from "./backoff";

export type ConnStatus = "connecting" | "live" | "reconnecting" | "offline";

interface Ctx { status: ConnStatus; refresh: () => void }
const RealtimeCtx = createContext<Ctx>({ status: "connecting", refresh: () => {} });
export const useRealtime = () => useContext(RealtimeCtx);

export interface RealtimeEvent { topic: string; event: string; payload: Record<string, unknown> }

/**
 * One provider per route. Realtime is only a HINT: every event invalidates queries, and the
 * truth is always refetched from Postgres. On (re)subscribe we resync everything.
 */
export function RealtimeProvider({ topics, onEvent, children }: {
  topics: string[];
  onEvent?: (e: RealtimeEvent) => void;
  children: ReactNode;
}) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<ConnStatus>("connecting");
  const onEventRef = useRef(onEvent);
  useEffect(() => { onEventRef.current = onEvent; });
  const topicKey = topics.join("|");

  const refresh = useCallback(() => { void qc.invalidateQueries(); }, [qc]);

  useEffect(() => {
    const supabase = createClient();
    const channels = new Map<string, RealtimeChannel>();
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const attempts = new Map<string, number>();
    const versions = new Map<string, number>();
    let cancelled = false; // guards React StrictMode double-mount and unmount races

    const subscribe = async (topic: string) => {
      if (cancelled) return;
      await supabase.realtime.setAuth();
      if (cancelled) return;
      const ch = supabase.channel(topic, { config: { private: true } });
      ch.on("broadcast", { event: "*" }, (msg) => {
        const payload = (msg.payload ?? {}) as Record<string, unknown>;
        if (isStale(versions.get(`${topic}:${msg.event}`), payload.version)) return;
        if (typeof payload.version === "number") versions.set(`${topic}:${msg.event}`, payload.version);
        onEventRef.current?.({ topic, event: msg.event, payload });
        void qc.invalidateQueries();
      }).subscribe((st) => {
        if (cancelled) return;
        if (st === "SUBSCRIBED") {
          attempts.set(topic, 0);
          setStatus("live");
          void qc.invalidateQueries(); // resync after (re)connect
        } else if (st === "CHANNEL_ERROR" || st === "TIMED_OUT" || st === "CLOSED") {
          setStatus(navigator.onLine ? "reconnecting" : "offline");
          void supabase.removeChannel(ch);
          channels.delete(topic);
          const n = attempts.get(topic) ?? 0;
          attempts.set(topic, n + 1);
          timers.set(topic, setTimeout(() => void subscribe(topic), backoffDelay(n)));
        }
      });
      channels.set(topic, ch);
    };

    topicKey.split("|").filter(Boolean).forEach((t) => void subscribe(t));

    const onOnline = () => { setStatus("reconnecting"); void qc.invalidateQueries(); };
    const onOffline = () => setStatus("offline");
    const onVisible = () => { if (document.visibilityState === "visible") void qc.invalidateQueries(); };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisible);
      timers.forEach(clearTimeout);
      channels.forEach((c) => void supabase.removeChannel(c));
    };
  }, [topicKey, qc]);

  const value = useMemo(() => ({ status, refresh }), [status, refresh]);
  return <RealtimeCtx.Provider value={value}>{children}</RealtimeCtx.Provider>;
}

const labels: Record<ConnStatus, string> = { connecting: "Connecting", live: "Live", reconnecting: "Reconnecting", offline: "Offline" };

/** Text + dot (never colour alone) and an always-available manual Refresh. */
export function ConnectionBadge() {
  const { status, refresh } = useRealtime();
  return (
    <span className="inline-flex items-center gap-2 text-xs">
      <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5" role="status" aria-live="polite">
        <span aria-hidden className={status === "live" ? "text-ok" : "text-warn"}>●</span>
        {labels[status]}
      </span>
      <button type="button" onClick={refresh} className="min-h-[28px] rounded px-2 underline">Refresh</button>
    </span>
  );
}
