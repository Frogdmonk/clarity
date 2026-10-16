"use client";
import dynamic from "next/dynamic";

/** Keeps CodeMirror out of the student live screen's initial bundle (budget: <= 150 KB gz). */
export const CodeEditor = dynamic(() => import("./code-editor"), {
  ssr: false,
  loading: () => <div className="h-64 animate-pulse rounded-md border border-border bg-surface-2" role="status" aria-label="Loading editor" />,
});
