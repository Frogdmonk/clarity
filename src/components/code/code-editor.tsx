"use client";
import { useEffect, useRef } from "react";
import { basicSetup, EditorView } from "codemirror";
import { EditorState } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { cpp } from "@codemirror/lang-cpp";
import { java } from "@codemirror/lang-java";
import type { Extension } from "@codemirror/state";

function languageExt(lang: string): Extension[] {
  switch (lang) {
    case "javascript": return [javascript()];
    case "typescript": return [javascript({ typescript: true })];
    case "python": return [python()];
    case "c": case "cpp": return [cpp()];
    case "java": return [java()];
    default: return [];
  }
}

/**
 * CodeMirror 6, loaded lazily (see code-editor-lazy.tsx). Code is PLAIN TEXT: it is only ever put
 * in the document model, never rendered as HTML. Keyboard: Tab indents; press Esc then Tab to leave.
 */
export default function CodeEditor({ value, onChange, readOnly = false, language = "plaintext", label }: {
  value: string; onChange?: (v: string) => void; readOnly?: boolean; language?: string; label: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; });

  useEffect(() => {
    if (!host.current) return;
    const v = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          keymap.of([indentWithTab]),
          ...languageExt(language),
          EditorState.readOnly.of(readOnly),
          EditorView.editable.of(!readOnly),
          EditorView.contentAttributes.of({ "aria-label": label }),
          EditorView.updateListener.of((u) => { if (u.docChanged) onChangeRef.current?.(u.state.doc.toString()); }),
        ],
      }),
    });
    view.current = v;
    return () => { v.destroy(); view.current = null; };
    // value is intentionally not a dependency: external changes are applied by the effect below
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, language, label]);

  // Apply external value changes (e.g. "take theirs", loading an older version) without echo loops.
  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value) {
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
    }
  }, [value]);

  return <div ref={host} />;
}
