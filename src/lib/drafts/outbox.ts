"use client";
import { createStore, del, get, keys, set, type UseStore } from "idb-keyval";
import { createClient } from "@/lib/supabase/client";
import type { LocalDraft } from "./saver";
import { saveDraftRpc } from "@/lib/rpc/rpc";

/** IndexedDB is a RECOVERY BUFFER only; Postgres is the source of truth. */
let store: UseStore | undefined;
function s(): UseStore | undefined {
  if (typeof indexedDB === "undefined") return undefined;
  store ??= createStore("clarity", "buffer");
  return store;
}

const draftKey = (uid: string, aid: string) => `draft:${uid}:${aid}`;
const signalKey = (uid: string, sid: string) => `signal:${uid}:${sid}`;

export async function getLocalDraft(uid: string, aid: string): Promise<LocalDraft | undefined> {
  const st = s();
  return st ? ((await get(draftKey(uid, aid), st)) as LocalDraft | undefined) : undefined;
}
export async function putLocalDraft(uid: string, aid: string, d: LocalDraft): Promise<void> {
  const st = s();
  if (st) await set(draftKey(uid, aid), d, st);
}

export async function getDeviceId(): Promise<string> {
  const st = s();
  if (!st) return "server";
  let id = (await get("device-id", st)) as string | undefined;
  if (!id) {
    id = crypto.randomUUID();
    await set("device-id", id, st);
  }
  return id;
}

/** Pending signal (offline tap). Latest value wins; flushed when back online. */
export async function queueSignal(uid: string, sid: string, value: string): Promise<void> {
  const st = s();
  if (st) await set(signalKey(uid, sid), value, st);
}
export async function takeQueuedSignal(uid: string, sid: string): Promise<string | undefined> {
  const st = s();
  if (!st) return undefined;
  const v = (await get(signalKey(uid, sid), st)) as string | undefined;
  if (v) await del(signalKey(uid, sid), st);
  return v;
}

/**
 * Sign-out: push unsynced drafts, then wipe this user's local buffer.
 * Returns ok:false (and keeps data) if something could not sync and `force` is not set.
 */
export async function flushAndClearDrafts(force: boolean): Promise<{ ok: boolean }> {
  const st = s();
  if (!st) return { ok: true };
  const { data } = await createClient().auth.getSession();
  const uid = data.session?.user.id; // id only, used to scope local keys; not a security decision
  if (!uid) return { ok: true };

  const all = (await keys(st)).filter((k): k is string => typeof k === "string" && k.startsWith(`draft:${uid}:`));
  let unsynced = 0;
  const device = await getDeviceId();
  for (const k of all) {
    const d = (await get(k, st)) as LocalDraft | undefined;
    if (!d?.dirty) continue;
    const aid = k.split(":")[2] ?? "";
    if (typeof navigator !== "undefined" && navigator.onLine === false) { unsynced++; continue; }
    try {
      const res = await saveDraftRpc(aid, d.code, d.baseRev, device);
      if (res.conflict) unsynced++;
    } catch {
      unsynced++;
    }
  }
  if (unsynced > 0 && !force) return { ok: false };
  for (const k of [...all, ...(await keys(st)).filter((k): k is string => typeof k === "string" && k.startsWith(`signal:${uid}:`) || k === `notebook:${uid}`)]) {
    await del(k, st);
  }
  return { ok: true };
}

/** Notebook offline cache (read-only copy, per user) so saved doubts can be reopened without a connection. */
export async function cacheNotebook(uid: string, entries: unknown[]): Promise<void> {
  const st = s();
  if (st) await set(`notebook:${uid}`, entries, st);
}
export async function getCachedNotebook<T>(uid: string): Promise<T[] | undefined> {
  const st = s();
  return st ? ((await get(`notebook:${uid}`, st)) as T[] | undefined) : undefined;
}
