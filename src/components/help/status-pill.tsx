import { Circle, CircleDot, CheckCircle2, RotateCcw } from "lucide-react";
import { copy } from "@/content/copy";
import type { RequestStatus } from "@/lib/types";
import { cn } from "@/lib/cn";

const meta = {
  open: { Icon: Circle, tone: "text-info border-info" },
  in_progress: { Icon: CircleDot, tone: "text-warn border-warn" },
  handled: { Icon: CheckCircle2, tone: "text-ok border-ok" },
  reopened: { Icon: RotateCcw, tone: "text-danger border-danger" },
} as const;

/** Status is never colour alone: icon + visible text label. */
export function StatusPill({ status }: { status: RequestStatus }) {
  const { Icon, tone } = meta[status];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", tone)}>
      <Icon aria-hidden size={14} />
      <span>{copy.status[status]}</span>
      <span className="sr-only"> status</span>
    </span>
  );
}
