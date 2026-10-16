import { pct } from "@/lib/format";

interface Props {
  understand: number | null | undefined;
  partial: number | null | undefined;
  lost: number | null | undefined;
  total: number;
  large?: boolean;
}

/**
 * Class pulse. Null buckets (fewer than 3 people, student view) show "–" instead of a number so a
 * small group cannot be re-identified. Distinct labels + icons-in-text, not colour alone.
 */
export function PulseMeter({ understand, partial, lost, total, large }: Props) {
  const rows = [
    { key: "understand", label: "Following", n: understand, bar: "bg-ok", mark: "✓" },
    { key: "partial", label: "Partly", n: partial, bar: "bg-warn", mark: "–" },
    { key: "lost", label: "Lost", n: lost, bar: "bg-danger", mark: "?" },
  ];
  const summary = rows.map((r) => `${r.label} ${r.n == null ? "hidden" : pct(r.n, total) + "%"}`).join(", ");
  return (
    <div role="group" aria-label={`Class pulse: ${summary}`} className="space-y-2">
      {rows.map((r) => (
        <div key={r.key} className="flex items-center gap-3">
          <span aria-hidden className={`w-5 text-center font-mono ${large ? "text-2xl" : ""}`}>{r.mark}</span>
          <span className={`w-20 ${large ? "text-xl" : "text-sm"}`}>{r.label}</span>
          <div className={`flex-1 overflow-hidden rounded bg-surface-2 ${large ? "h-6" : "h-3"}`} aria-hidden>
            <div className={`h-full ${r.bar}`} style={{ width: `${r.n == null ? 0 : pct(r.n, total)}%` }} />
          </div>
          <span className={`w-12 text-right tabular-nums ${large ? "text-xl" : "text-sm"}`}>
            {r.n == null ? "–" : `${pct(r.n, total)}%`}
          </span>
        </div>
      ))}
    </div>
  );
}
