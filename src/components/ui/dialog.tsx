"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Native <dialog>: focus trap, Escape and backdrop come from the platform. */
export function Dialog({ open, onClose, title, children, sheet }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; sheet?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog ref={ref} aria-label={title} onClose={onClose} className={cn(sheet && "sheet")}>
      <div className="space-y-4 p-5">
        <h2 className="text-lg font-semibold">{title}</h2>
        {children}
      </div>
    </dialog>
  );
}
