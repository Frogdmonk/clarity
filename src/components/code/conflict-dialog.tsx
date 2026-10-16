"use client";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { ConflictChoice, ServerDraft } from "@/lib/drafts/saver";
import { dateTime } from "@/lib/format";

/** Never auto-discards: every option keeps the student's text reachable. */
export function ConflictDialog({ server, onResolve }: { server: ServerDraft | null; onResolve: (c: ConflictChoice) => void }) {
  return (
    <Dialog open={!!server} onClose={() => {}} title="A newer version was saved elsewhere">
      <p className="text-sm text-text-2">
        This activity was saved from another tab or device{server ? ` at ${dateTime(server.saved_at)}` : ""}. Nothing has been overwritten. Choose what to keep:
      </p>
      <div className="grid gap-2">
        <Button onClick={() => onResolve("keep_mine")}>Keep mine (save as the newest version)</Button>
        <Button variant="secondary" onClick={() => onResolve("take_theirs")}>Take theirs (replace what&apos;s here)</Button>
        <Button variant="secondary" onClick={() => onResolve("park_then_theirs")}>Save mine as a snapshot, then take theirs</Button>
      </div>
    </Dialog>
  );
}
