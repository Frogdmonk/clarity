import { CloudOff, Check, Loader2, AlertTriangle, Pencil } from "lucide-react";
import type { DraftStatus } from "@/lib/drafts/saver";
import { copy, errorMessage } from "@/content/copy";
import { clock } from "@/lib/format";

/** aria-live=polite: announces save state without ever stealing focus from the editor. */
export function SaveIndicator({ status, onRetry }: { status: DraftStatus; onRetry: () => void }) {
  let icon = <Check aria-hidden size={14} />;
  let text = "";
  switch (status.kind) {
    case "idle": text = "No changes yet"; break;
    case "dirty": icon = <Pencil aria-hidden size={14} />; text = "Unsaved changes"; break;
    case "saving": icon = <Loader2 aria-hidden size={14} className="animate-spin" />; text = "Saving…"; break;
    case "saved": text = `Saved ${clock(status.at)}`; break;
    case "offline": icon = <CloudOff aria-hidden size={14} />; text = "Offline — changes stored locally"; break;
    case "conflict": icon = <AlertTriangle aria-hidden size={14} />; text = "Newer version found — choose what to keep"; break;
    case "error": icon = <AlertTriangle aria-hidden size={14} />; text = status.code === "rate_limited" ? copy.errors.busy : `Save failed — ${errorMessage(status.code)}`; break;
  }
  return (
    <p role="status" aria-live="polite" className="flex items-center gap-2 text-sm text-text-2">
      {icon}<span>{text}</span>
      {status.kind === "error" && <button type="button" onClick={onRetry} className="min-h-[28px] underline">Retry</button>}
    </p>
  );
}
