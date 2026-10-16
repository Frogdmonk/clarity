import { diffLines } from "@/lib/diff";
import { cn } from "@/lib/cn";

/** Plain-text diff: lines are rendered as text nodes, never HTML. Signs + colour (not colour alone). */
export function DiffView({ before, after }: { before: string; after: string }) {
  const lines = diffLines(before, after);
  return (
    <pre className="max-h-[50vh] overflow-auto rounded-md border border-border bg-surface p-2 font-mono text-xs" aria-label="Differences">
      {lines.map((l, i) => (
        <div key={i} className={cn(
          l.kind === "add" && "bg-ok/15 text-ok", l.kind === "del" && "bg-danger/15 text-danger line-through decoration-1")}>
          <span aria-hidden className="select-none pr-2">{l.kind === "add" ? "+" : l.kind === "del" ? "-" : " "}</span>
          <span className="sr-only">{l.kind === "add" ? "added: " : l.kind === "del" ? "removed: " : ""}</span>
          {l.text || " "}
        </div>
      ))}
    </pre>
  );
}
