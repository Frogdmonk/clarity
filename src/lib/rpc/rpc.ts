"use client";
import { createClient } from "@/lib/supabase/client";
import { NetworkError, RpcCodeError, type SaveResult } from "@/lib/drafts/saver";
import type {
  AnonMode, RequestCategory, RequestStatus, SnapshotHeader, TeacherRequest, TeacherThreadMessage,
  Understanding, Poll,
} from "@/lib/types";

/** The only module that calls supabase.rpc. Maps database errors to stable codes. */
function toError(err: { message?: string; code?: string }): Error {
  const msg = err.message ?? "";
  if (/^[a-z_]+$/.test(msg)) return new RpcCodeError(msg);
  if (err.code === "42501") return new RpcCodeError("permission_denied");
  if (/violates (check|not-null)/i.test(msg)) return new RpcCodeError("invalid_input");
  if (/fetch|network|timeout|offline|abort|failed to/i.test(msg) || err.code === "") return new NetworkError(msg);
  return new RpcCodeError("generic");
}

async function call<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  let res;
  try {
    res = await createClient().rpc(fn, args);
  } catch (e) {
    throw new NetworkError(e instanceof Error ? e.message : "network");
  }
  if (res.error) throw toError(res.error);
  return res.data as T; // typed by each wrapper below; DB types generation is tracked in KNOWN_LIMITATIONS
}

export function codeOf(e: unknown): string {
  if (e instanceof RpcCodeError) return e.code;
  if (e instanceof NetworkError) return "offline";
  return "generic";
}

// ---------- student ----------
export type JoinResult = { ok: true; session_id: string } | { ok: false; error: string };
export const joinByCode = (code: string) => call<JoinResult>("join_session_by_code", { p_code: code });
export const joinSession = (sessionId: string) => call<JoinResult>("join_session", { p_session: sessionId });
export const heartbeat = (sessionId: string) => call<void>("heartbeat", { p_session: sessionId });
export const setSignal = (sessionId: string, value: Understanding, topicId?: string | null) =>
  call<void>("set_signal", { p_session: sessionId, p_value: value, p_topic: topicId ?? null });

export interface PulseView {
  revealed: boolean; total?: number; understand?: number | null; partial?: number | null; lost?: number | null;
  others_lost_on_topic?: number | null;
}
export const getPulseAfterCommit = (sessionId: string) => call<PulseView>("get_pulse_after_commit", { p_session: sessionId });

export interface CreateRequestInput {
  sessionId: string; category: RequestCategory; message: string; idempotencyKey: string;
  activityId?: string | null; topicId?: string | null; anonymous?: boolean; blocked?: boolean;
}
export interface CreateRequestResult {
  duplicate: boolean; request: { id: string; status: RequestStatus; created_at: string };
  queue_position?: number; similar_count?: number | null;
}
export const createHelpRequest = (i: CreateRequestInput) =>
  call<CreateRequestResult>("create_help_request", {
    p_session: i.sessionId, p_category: i.category, p_message: i.message, p_idempotency_key: i.idempotencyKey,
    p_activity: i.activityId ?? null, p_topic: i.topicId ?? null,
    p_is_anonymous: i.anonymous ?? false, p_is_blocked: i.blocked ?? false,
  });
export const addFollowUp = (requestId: string, body: string) => call<void>("add_follow_up", { p_request: requestId, p_body: body });
export const confirmResolution = (requestId: string, outcome: "cleared" | "partly" | "not_cleared") =>
  call<void>("confirm_resolution", { p_request: requestId, p_outcome: outcome });

export const saveDraftRpc = (activityId: string, code: string, baseRev: number, deviceId: string) =>
  call<SaveResult>("save_draft", { p_activity: activityId, p_code: code, p_base_rev: baseRev, p_device: deviceId });
export const snapshotMyCode = (activityId: string, code: string) =>
  call<number>("snapshot_my_code", { p_activity: activityId, p_code: code });
export const submitCode = (activityId: string, code: string, key: string) =>
  call<{ version: number; created_at: string; duplicate: boolean }>("submit_code", {
    p_activity: activityId, p_code: code, p_idempotency_key: key,
  });

export const respondPoll = (pollId: string, response: unknown, confidence?: number | null) =>
  call<void>("respond_poll", { p_poll: pollId, p_response: response, p_confidence: confidence ?? null });
export const getSessionPolls = (sessionId: string) => call<Poll[]>("get_session_polls", { p_session: sessionId });
export interface PollResults { total: number; counts: Record<string, number>; confidence: Record<string, number> }
export const pollResults = (pollId: string) => call<PollResults>("poll_results", { p_poll: pollId });
export const submitExitTicket = (sessionId: string, muddiest: string, confidence: number) =>
  call<void>("submit_exit_ticket", { p_session: sessionId, p_muddiest: muddiest, p_confidence: confidence });

// ---------- teacher ----------
export const createCourse = (title: string, description?: string) =>
  call<string>("create_course", { p_title: title, p_description: description ?? null });
export const enrolStudents = (courseId: string, ugNumbers: string[]) =>
  call<{ enrolled: number; not_found: string[] }>("enrol_students", { p_course: courseId, p_ug_numbers: ugNumbers });
export const removeStudent = (courseId: string, studentId: string) =>
  call<void>("remove_student", { p_course: courseId, p_student: studentId });
export const createSession = (courseId: string, title: string, scheduledAt?: string | null) =>
  call<{ id: string; join_code: string }>("create_session", { p_course: courseId, p_title: title, p_scheduled_at: scheduledAt ?? null });
export const rotateJoinCode = (sessionId: string) => call<string>("rotate_join_code", { p_session: sessionId });
export const startSession = (sessionId: string, version: number) => call<unknown>("start_session", { p_session: sessionId, p_expected_version: version });
export const endSession = (sessionId: string, version: number) => call<unknown>("end_session", { p_session: sessionId, p_expected_version: version });
export const setTopic = (sessionId: string, label: string | null) => call<string | null>("set_topic", { p_session: sessionId, p_label: label });
export const pauseQuestions = (sessionId: string, paused: boolean) => call<void>("pause_questions", { p_session: sessionId, p_paused: paused });
export const openQaWindow = (sessionId: string, open: boolean) => call<void>("open_qa_window", { p_session: sessionId, p_open: open });

export const teacherRequests = (sessionId: string) => call<TeacherRequest[]>("teacher_requests_for_session", { p_session: sessionId });
export const teacherThread = (requestId: string) =>
  call<{ messages: TeacherThreadMessage[]; events: { event_type: string; created_at: string; metadata: Record<string, unknown> }[] }>(
    "teacher_request_thread", { p_request: requestId });
export const replyToRequest = (requestId: string, body: string, kind: "reply" | "hint" | "guiding_question" = "reply") =>
  call<string>("reply_to_request", { p_request: requestId, p_body: body, p_kind: kind });
export const setRequestStatus = (requestId: string, to: RequestStatus, expected: RequestStatus) =>
  call<{ id: string; status: RequestStatus; updated_at: string; handled_at: string | null }>("set_request_status", {
    p_request: requestId, p_to: to, p_expected: expected,
  });
export const revealIdentity = (requestId: string) => call<void>("reveal_identity", { p_request: requestId });
export const addressCluster = (clusterId: string, note: string) => call<number>("address_cluster", { p_cluster: clusterId, p_note: note });
export const mergeClusters = (from: string, into: string) => call<void>("merge_clusters", { p_from: from, p_into: into });

export interface StudentDraftView {
  has_code: boolean; request_snapshot_id?: string | null;
  draft?: { code: string; rev: number; saved_at: string } | null; snapshots?: SnapshotHeader[];
}
export const getStudentDraft = (requestId: string) => call<StudentDraftView>("get_student_draft", { p_request: requestId });
export const getRequestSnapshot = (requestId: string, snapshotId: string) =>
  call<{ id: string; version: number; kind: string; code: string; created_at: string }>("get_request_snapshot", {
    p_request: requestId, p_snapshot: snapshotId,
  });
export const listSubmissions = (activityId: string) =>
  call<{ student_id: string; full_name: string; latest_version: number; submitted_at: string; attempts: number }[]>(
    "list_activity_submissions", { p_activity: activityId });

export const createPoll = (i: {
  sessionId: string; question: string; kind: string; options: string[]; correct: unknown;
  allowChange: boolean; requireConfidence: boolean;
}) => call<string>("create_poll", {
  p_session: i.sessionId, p_question: i.question, p_kind: i.kind, p_options: i.options, p_correct: i.correct,
  p_allow_change: i.allowChange, p_require_confidence: i.requireConfidence,
});
export const openPoll = (id: string) => call<void>("open_poll", { p_poll: id });
export const closePoll = (id: string) => call<void>("close_poll", { p_poll: id });
export const revealPoll = (id: string) => call<void>("reveal_poll", { p_poll: id });

// ---------- admin ----------
export const adminSetRole = (userId: string, role: "student" | "teacher" | "admin") => call<void>("admin_set_role", { p_user: userId, p_role: role });
export const adminSetVerification = (userId: string, status: "pending" | "verified" | "rejected" | "disabled") =>
  call<void>("admin_set_verification", { p_user: userId, p_status: status });
export const adminImportRoster = (rows: { ug_number: string; full_name: string }[]) =>
  call<{ imported: number; invalid: number; verified_now: number }>("admin_import_roster", { p_rows: rows });
export const adminBreakGlass = (requestId: string, reason: string) =>
  call<{ student_id: string; full_name: string; ug_number: string | null }>("admin_break_glass_reveal", { p_request: requestId, p_reason: reason });
export const adminPurgeUser = (userId: string) => call<void>("admin_purge_user", { p_user: userId });
export const getPublicSettings = () => call<{ roster_mode: boolean; ug_regex: string; default_doubt_bank_hours: number }>("get_public_settings");

export type { AnonMode };

// ---------- later additions (migration 0014) ----------
export interface RosterRow { user_id: string; full_name: string; ug_number: string | null; status: "active" | "invited" | "removed" }
export const teacherCourseRoster = (courseId: string) => call<RosterRow[]>("teacher_course_roster", { p_course: courseId });
export const teacherSessionStats = (sessionId: string) =>
  call<{ joined: number; connected: number; enrolled: number }>("teacher_session_stats", { p_session: sessionId });
export interface DoubtBankRow {
  request_id: string; session_id: string; session_title: string; course_title: string; display_name: string;
  is_anonymous: boolean; category: RequestCategory; message: string; status: RequestStatus; has_code: boolean; created_at: string;
}
export const teacherDoubtBank = () => call<DoubtBankRow[]>("teacher_doubt_bank");
export interface AdminSettings { roster_mode: boolean; ug_regex: string; doubt_bank_hours: number }
export const adminListSettings = () => call<AdminSettings>("admin_list_settings");
export const adminUpdateSettings = (s: AdminSettings) =>
  call<void>("admin_update_settings", { p_roster_mode: s.roster_mode, p_ug_regex: s.ug_regex, p_doubt_bank_hours: s.doubt_bank_hours });
