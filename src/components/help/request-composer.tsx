"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/card";
import { copy, errorMessage } from "@/content/copy";
import { codeOf, createHelpRequest, type CreateRequestResult } from "@/lib/rpc/rpc";
import { helpRequestSchema } from "@/lib/validation/schemas";
import type { Activity, AnonMode, RequestCategory } from "@/lib/types";
import { cn } from "@/lib/cn";

const categories: { v: RequestCategory; label: string }[] = [
  { v: "concept", label: "Concept" },
  { v: "coding", label: "Coding" },
  { v: "example", label: "Example" },
  { v: "pace", label: "Pace" },
  { v: "other", label: "Other" },
];

export function RequestComposer({ open, onClose, sessionId, anonMode, topicId, activities, defaultActivityId, doubtBank, onBeforeSend }: {
  open: boolean; onClose: () => void; sessionId: string; anonMode: AnonMode; topicId: string | null;
  activities: Activity[]; defaultActivityId?: string | null; doubtBank?: boolean;
  /** e.g. flush the code draft so the teacher sees the latest version */
  onBeforeSend?: () => Promise<void>;
}) {
  const qc = useQueryClient();
  const [category, setCategory] = useState<RequestCategory>("concept");
  const [message, setMessage] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [activityId, setActivityId] = useState<string>(defaultActivityId ?? "");
  const [key, setKey] = useState(() => crypto.randomUUID()); // double-tap safe: same key until success
  const [result, setResult] = useState<CreateRequestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = useMutation({
    mutationFn: async () => {
      const parsed = helpRequestSchema.safeParse({ category, message });
      if (!parsed.success) throw Object.assign(new Error("invalid"), { friendly: parsed.error.issues[0]?.message });
      if (onBeforeSend) await onBeforeSend().catch(() => {});
      return createHelpRequest({
        sessionId, category: parsed.data.category, message: parsed.data.message, idempotencyKey: key,
        activityId: activityId || null, topicId, anonymous: anonymous && anonMode !== "identified", blocked,
      });
    },
    onSuccess: (r) => {
      setResult(r);
      setError(null);
      setKey(crypto.randomUUID());
      setMessage("");
      void qc.invalidateQueries({ queryKey: ["myRequests"] });
    },
    onError: (e) => {
      const friendly = (e as { friendly?: string }).friendly;
      setError(friendly ?? errorMessage(codeOf(e)));
    },
  });

  function close() {
    setResult(null);
    setError(null);
    onClose();
  }

  const title = doubtBank ? copy.ask.later : copy.ask.button;
  return (
    <Dialog open={open} onClose={close} title={title} sheet>
      {result ? (
        <div className="space-y-3" aria-live="polite">
          <Alert tone="ok">
            {doubtBank ? "Sent to the Doubt Bank. Your teacher will see it before the next class." : copy.ask.sent("Your teacher")}
          </Alert>
          {!doubtBank && result.queue_position != null && <p className="text-sm">{copy.ask.receipt(result.queue_position)}</p>}
          {result.similar_count != null && <p className="text-sm text-text-2">{copy.ask.classmates(result.similar_count)}</p>}
          <div className="flex justify-end gap-2">
            <Link href={`/student/help/${result.request.id}`} className="inline-flex min-h-[44px] items-center rounded-md border border-border px-4 text-sm">View thread</Link>
            <Button onClick={close}>Done</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); send.mutate(); }} className="space-y-4">
          <p className="text-sm text-text-2">{copy.tagline} {copy.normalise}</p>
          <fieldset>
            <legend className="mb-1 text-sm font-medium">What kind of question?</legend>
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => (
                <label key={c.v} className={cn(
                  "inline-flex min-h-[44px] cursor-pointer items-center rounded-full border px-4 text-sm",
                  category === c.v ? "border-accent bg-accent text-accent-contrast" : "border-border bg-surface")}>
                  <input type="radio" name="category" value={c.v} checked={category === c.v} onChange={() => setCategory(c.v)} className="sr-only" />
                  {c.label}
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <label htmlFor="msg" className="mb-1 block text-sm font-medium">Your question</label>
            <Textarea id="msg" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000}
              placeholder={copy.ask.placeholder} autoFocus />
          </div>
          {activities.length > 0 && (
            <div>
              <label htmlFor="act" className="mb-1 block text-sm font-medium">Attach my code from (optional)</label>
              <select id="act" value={activityId} onChange={(e) => setActivityId(e.target.value)}
                className="min-h-[44px] w-full rounded-md border border-border bg-surface px-3">
                <option value="">Nothing</option>
                {activities.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
              </select>
            </div>
          )}
          <div className="space-y-1">
            <label className="flex min-h-[44px] items-center gap-3 text-sm">
              <input type="checkbox" className="size-5" checked={anonymous && anonMode !== "identified"}
                disabled={anonMode === "identified"} onChange={(e) => setAnonymous(e.target.checked)} aria-describedby="anon-copy" />
              {copy.anon.label}
            </label>
            <p id="anon-copy" className="text-xs text-text-2">{copy.anon[anonMode]}</p>
          </div>
          {!doubtBank && (
            <label className="flex min-h-[44px] items-center gap-3 text-sm">
              <input type="checkbox" className="size-5" checked={blocked} onChange={(e) => setBlocked(e.target.checked)} />
              {copy.ask.blocked}
            </label>
          )}
          {error && <Alert tone="danger">{error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={close}>Cancel</Button>
            <Button type="submit" disabled={send.isPending}>{send.isPending ? "Sending…" : "Send"}</Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
