"use client";
import { useState } from "react";
import { logoutAction } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { flushAndClearDrafts } from "@/lib/drafts/outbox";

/** Flushes unsynced drafts before signing out; warns if that is impossible (offline). */
export function SignOutButton() {
  const [warn, setWarn] = useState(false);
  const [busy, setBusy] = useState(false);

  async function go(force: boolean) {
    setBusy(true);
    const res = await flushAndClearDrafts(force);
    if (!res.ok) {
      setBusy(false);
      setWarn(true);
      return;
    }
    await logoutAction();
  }

  return (
    <>
      <Button variant="ghost" disabled={busy} onClick={() => go(false)}>Sign out</Button>
      <Dialog open={warn} onClose={() => setWarn(false)} title="Unsynced work will be removed">
        <p className="text-sm text-text-2">You&apos;re offline or a save failed. Signing out now removes unsynced work from this device.</p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setWarn(false)}>Stay signed in</Button>
          <Button variant="danger" onClick={() => go(true)}>Sign out anyway</Button>
        </div>
      </Dialog>
    </>
  );
}
