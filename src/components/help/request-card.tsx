import Link from "next/link";
import { StatusPill } from "./status-pill";
import { waitLabel } from "@/lib/format";
import type { MyRequest } from "@/lib/types";

export function RequestCard({ r, now }: { r: MyRequest; now: number }) {
  return (
    <Link href={`/student/help/${r.id}`} className="block rounded-lg border border-border bg-surface p-3 hover:bg-surface-2">
      <div className="flex items-center justify-between gap-2">
        <StatusPill status={r.status} />
        <span className="text-xs text-text-3">{waitLabel(r.created_at, now)}{r.is_doubt_bank ? " · Doubt Bank" : ""}</span>
      </div>
      <p className="mt-2 line-clamp-2 text-sm">{r.message}</p>
      <p className="mt-1 text-xs text-text-3 capitalize">{r.category}{r.is_anonymous ? " · anonymous" : ""}</p>
    </Link>
  );
}
