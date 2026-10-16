"use client";
import { Check, HelpCircle, Minus } from "lucide-react";
import { copy } from "@/content/copy";
import type { Understanding } from "@/lib/types";
import { cn } from "@/lib/cn";

const options = [
  { v: "understand", label: copy.signal.understand, Icon: Check },
  { v: "partial", label: copy.signal.partial, Icon: Minus },
  { v: "lost", label: copy.signal.lost, Icon: HelpCircle },
] as const satisfies readonly { v: Understanding; label: string; Icon: typeof Check }[];

/** B1: one tap, zero typing, thumb-reachable (>= 56px tall). Icon + label, never colour alone. */
export function UnderstandingBar({ value, onSelect, disabled }: {
  value: Understanding | null; onSelect: (v: Understanding) => void; disabled?: boolean;
}) {
  return (
    <div role="group" aria-label={copy.signal.heading} className="grid grid-cols-3 gap-3">
      {options.map(({ v, label, Icon }) => {
        const on = value === v;
        return (
          <button
            key={v}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            onClick={() => onSelect(v)}
            className={cn(
              "flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-lg border-2 px-2 py-2 text-sm font-medium",
              "disabled:cursor-not-allowed disabled:opacity-50",
              on ? "border-accent bg-accent text-accent-contrast" : "border-border bg-surface hover:bg-surface-2",
              v === "lost" && !on && "border-dashed",
            )}
          >
            <Icon aria-hidden size={22} />
            {label}
          </button>
        );
      })}
    </div>
  );
}
