"use client";
import { useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/card";

interface Detector { detect(src: HTMLVideoElement): Promise<{ rawValue: string }[]> }
declare global {
  interface Window { BarcodeDetector?: new (o: { formats: string[] }) => Detector }
}

/** Extracts a join code from a scanned URL (?code=XXXXXX) or a bare code. */
export function parseJoinCode(raw: string): string | null {
  try {
    const u = new URL(raw);
    const c = u.searchParams.get("code");
    if (c) return c.toUpperCase();
  } catch { /* not a URL */ }
  const bare = raw.trim().toUpperCase();
  return /^[A-Z0-9]{6}$/.test(bare) ? bare : null;
}

export function QrScanner({ onCode }: { onCode: (code: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const supported = typeof window !== "undefined" && !!window.BarcodeDetector && !!navigator.mediaDevices?.getUserMedia;

  useEffect(() => {
    if (!supported) return;
    let stream: MediaStream | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    let stopped = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (stopped || !video.current) { stream.getTracks().forEach((t) => t.stop()); return; }
        video.current.srcObject = stream;
        await video.current.play();
        const detector = new window.BarcodeDetector!({ formats: ["qr_code"] });
        timer = setInterval(async () => {
          if (!video.current) return;
          const found = await detector.detect(video.current).catch(() => []);
          const code = found[0] ? parseJoinCode(found[0].rawValue) : null;
          if (code) onCode(code);
        }, 400);
      } catch {
        setError("Camera isn't available. You can type the code instead.");
      }
    })();
    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [supported, onCode]);

  if (!supported) return <p className="text-sm text-text-3">QR scanning isn&apos;t supported in this browser. Type the code instead.</p>;
  return (
    <div className="space-y-2">
      {error ? <Alert tone="warn">{error}</Alert> : <video ref={video} muted playsInline aria-label="Camera view for scanning the class QR code" className="w-full rounded-md border border-border" />}
    </div>
  );
}
