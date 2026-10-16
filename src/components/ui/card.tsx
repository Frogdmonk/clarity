import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-lg border border-border bg-surface p-4", className)} {...props} />;
}

export function PageHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-text-2">{children}</p>;
}

export function Alert({ tone = "info", children }: { tone?: "info" | "ok" | "warn" | "danger"; children: React.ReactNode }) {
  const tones = {
    info: "border-info text-info", ok: "border-ok text-ok", warn: "border-warn text-warn", danger: "border-danger text-danger",
  } as const;
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("rounded-md border bg-surface px-3 py-2 text-sm", tones[tone])}>
      {children}
    </div>
  );
}
