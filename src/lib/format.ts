export function minutesSince(iso: string, now: number = Date.now()): number {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
}

export function waitLabel(iso: string, now: number = Date.now()): string {
  const m = minutesSince(iso, now);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function clock(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

/** Percent rounded; 0 when total is 0. */
export function pct(n: number, total: number): number {
  return total <= 0 ? 0 : Math.round((n / total) * 100);
}
