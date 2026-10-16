"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { useQuery } from "@tanstack/react-query";
import { PulseMeter } from "@/components/signals/pulse-meter";
import { fetchJoinCode, fetchPulse, fetchSession, keys } from "@/lib/queries";
import { teacherSessionStats } from "@/lib/rpc/rpc";

/** Projector view: join code, QR, and aggregate pulse only. No identities, no question text. */
export function PresenterView({ sessionId }: { sessionId: string }) {
  const session = useQuery({ queryKey: keys.session(sessionId), queryFn: () => fetchSession(sessionId), refetchInterval: 10_000 });
  const code = useQuery({ queryKey: keys.joinCode(sessionId), queryFn: () => fetchJoinCode(sessionId), refetchInterval: 10_000 });
  const pulse = useQuery({ queryKey: ["pulseT", sessionId], queryFn: () => fetchPulse(sessionId), refetchInterval: 4_000 });
  const stats = useQuery({ queryKey: keys.stats(sessionId), queryFn: () => teacherSessionStats(sessionId), refetchInterval: 10_000 });
  const [qr, setQr] = useState<string | null>(null);
  const joinCode = code.data ?? null;

  useEffect(() => {
    if (!joinCode) return;
    let cancelled = false;
    const url = `${window.location.origin}/student/join?code=${encodeURIComponent(joinCode)}`;
    QRCode.toDataURL(url, { margin: 1, width: 480, errorCorrectionLevel: "M" })
      .then((d) => { if (!cancelled) setQr(d); })
      .catch(() => { if (!cancelled) setQr(null); });
    return () => { cancelled = true; };
  }, [joinCode]);

  const p = pulse.data;
  const total = p ? p.understand + p.partial + p.lost : 0;
  return (
    <div className="mx-auto grid min-h-[80vh] max-w-6xl items-center gap-10 p-4 md:grid-cols-2">
      <div className="space-y-4 text-center">
        <h1 className="text-3xl font-semibold">{session.data?.title ?? "Session"}</h1>
        <p className="text-xl text-text-2">Join at this site with the code</p>
        <p className="font-mono text-7xl font-bold tracking-widest" aria-label={`Join code ${joinCode?.split("").join(" ") ?? "not available"}`}>{joinCode ?? "—"}</p>
        {/* eslint-disable-next-line @next/next/no-img-element -- data URL generated locally */}
        {qr && <img src={qr} alt="QR code to join this session" width={240} height={240} className="mx-auto rounded-md bg-white p-2" />}
        {stats.data && <p className="text-lg text-text-2">{stats.data.connected} here now</p>}
      </div>
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold">How is it going?</h2>
        {total >= 3 && p ? <PulseMeter understand={p.understand} partial={p.partial} lost={p.lost} total={total} large />
          : <p className="text-xl text-text-3">Waiting for responses…</p>}
      </div>
    </div>
  );
}
