"use client";
import { createClient } from "@/lib/supabase/client";
import type {
  Activity, Course, MyRequest, NotebookEntry, Pulse, Session, ThreadMessage, Topic, Understanding,
} from "@/lib/types";

/** RLS-scoped reads. Each helper throws on error so TanStack Query can retry/surface it. */
// Boundary cast: the client is untyped until `pnpm db:types` is run against a real Supabase stack,
// so each caller declares the row shape it selects (see src/lib/types.ts).
async function must<T>(p: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data as T;
}
const sb = () => createClient();

export type SessionWithCourse = Session & { courses: Pick<Course, "id" | "title" | "settings"> };

export const keys = {
  session: (id: string) => ["session", id] as const,
  membership: (id: string) => ["membership", id] as const,
  topics: (id: string) => ["topics", id] as const,
  activities: (id: string) => ["activities", id] as const,
  mySignal: (id: string) => ["mySignal", id] as const,
  pulseAfter: (id: string) => ["pulseAfter", id] as const,
  myRequests: (sid?: string) => ["myRequests", sid ?? "all"] as const,
  request: (rid: string) => ["request", rid] as const,
  thread: (rid: string) => ["thread", rid] as const,
  polls: (id: string) => ["polls", id] as const,
  notebook: () => ["notebook"] as const,
  myCourses: () => ["myCourses"] as const,
  liveSessions: () => ["liveSessions"] as const,
  exitTicket: (id: string) => ["exitTicket", id] as const,
  course: (id: string) => ["course", id] as const,
  courseSessions: (id: string) => ["courseSessions", id] as const,
  teacherSessions: () => ["teacherSessions"] as const,
  roster: (id: string) => ["roster", id] as const,
  joinCode: (id: string) => ["joinCode", id] as const,
  tRequests: (id: string) => ["tRequests", id] as const,
  tThread: (id: string) => ["tThread", id] as const,
  stats: (id: string) => ["stats", id] as const,
  pulseHistory: (id: string) => ["pulseHistory", id] as const,
  doubtBank: () => ["doubtBank"] as const,
  clusters: (id: string) => ["clusters", id] as const,
};

export const fetchSession = (id: string) =>
  must<SessionWithCourse>(sb().from("sessions").select("*, courses(id,title,settings)").eq("id", id).single());

export async function fetchMembership(sessionId: string): Promise<boolean> {
  const { data } = await sb().from("session_members").select("session_id").eq("session_id", sessionId).maybeSingle();
  return !!data;
}

export const fetchTopics = (sessionId: string) =>
  must<Topic[]>(sb().from("topics").select("*").eq("session_id", sessionId).order("started_at"));

export const fetchActivities = (sessionId: string) =>
  must<Activity[]>(sb().from("activities").select("*").eq("session_id", sessionId).order("created_at"));

export async function fetchMySignal(sessionId: string): Promise<Understanding | null> {
  const { data } = await sb().from("understanding_signals").select("value").eq("session_id", sessionId).maybeSingle();
  return (data?.value as Understanding | undefined) ?? null;
}

export const fetchMyRequests = (sessionId?: string) => {
  let q = sb().from("help_requests").select("*").order("created_at", { ascending: false }).limit(200);
  if (sessionId) q = q.eq("session_id", sessionId);
  return must<MyRequest[]>(q);
};

export const fetchRequest = (id: string) => must<MyRequest>(sb().from("help_requests").select("*").eq("id", id).single());

export const fetchThread = (id: string) =>
  must<ThreadMessage[]>(sb().from("help_request_messages").select("*").eq("request_id", id).order("created_at"));

export const fetchNotebook = () =>
  must<NotebookEntry[]>(sb().from("notebook_entries").select("*").order("created_at", { ascending: false }).limit(500));

export interface MyCourse { course_id: string; member_role: "student" | "teacher"; courses: Pick<Course, "id" | "title" | "description"> }
export const fetchMyCourses = () =>
  must<MyCourse[]>(sb().from("course_members").select("course_id, member_role, courses(id,title,description)").eq("status", "active"));

export type SessionRow = Session & { courses: Pick<Course, "title" | "settings"> };
export const fetchLiveAndRecentSessions = () =>
  must<SessionRow[]>(
    sb().from("sessions").select("*, courses(title,settings)").in("status", ["live", "ended"])
      .order("created_at", { ascending: false }).limit(30),
  );

export const fetchPulse = (sessionId: string) =>
  must<Pulse>(sb().from("session_pulse").select("*").eq("session_id", sessionId).single());

/** Hours left in a Doubt Bank window (<= 0 means closed). */
export function doubtBankHoursLeft(s: Pick<Session, "ended_at"> & { courses: { settings: { doubt_bank_hours?: number } } }, now = Date.now()): number {
  if (!s.ended_at) return 0;
  const window = s.courses.settings.doubt_bank_hours ?? 48;
  return window - (now - new Date(s.ended_at).getTime()) / 3_600_000;
}

export async function fetchSnapshotCode(id: string): Promise<string | null> {
  const row = await must<{ code: string } | null>(sb().from("code_snapshots").select("code").eq("id", id).maybeSingle());
  return row?.code ?? null;
}
export const fetchCourseIdOfSession = async (sessionId: string): Promise<string> =>
  (await must<{ course_id: string }>(sb().from("sessions").select("course_id").eq("id", sessionId).single())).course_id;

export const fetchCourse = (id: string) => must<Course>(sb().from("courses").select("*").eq("id", id).single());
export const fetchCourseSessions = (courseId: string) =>
  must<Session[]>(sb().from("sessions").select("*").eq("course_id", courseId).order("created_at", { ascending: false }).limit(100));
export const fetchTeacherSessions = () =>
  must<SessionRow[]>(sb().from("sessions").select("*, courses(title,settings)").order("created_at", { ascending: false }).limit(50));
export const fetchJoinCode = async (sessionId: string): Promise<string | null> => {
  const row = await must<{ join_code: string } | null>(sb().from("session_secrets").select("join_code").eq("session_id", sessionId).maybeSingle());
  return row?.join_code ?? null;
};

export const fetchClusters = (sessionId: string) =>
  must<import("@/lib/types").Cluster[]>(sb().from("clusters").select("*").eq("session_id", sessionId).order("created_at"));
