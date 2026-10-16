export type AppRole = "student" | "teacher" | "admin";
export type Verification = "pending" | "verified" | "rejected" | "disabled";
export type RequestStatus = "open" | "in_progress" | "handled" | "reopened";
export type RequestCategory = "concept" | "coding" | "example" | "pace" | "other";
export type Understanding = "understand" | "partial" | "lost";
export type SessionStatus = "scheduled" | "live" | "ended";
export type AnonMode = "identified" | "masked" | "strict";

export interface CourseSettings {
  anonymity_mode: AnonMode;
  doubt_bank_hours: number;
  behaviour: { pulse_reveal_after_commit: boolean; impact_messages: boolean; exit_ticket: boolean };
}

export interface Course {
  id: string;
  title: string;
  description: string | null;
  owner_id: string;
  settings: CourseSettings;
  created_at: string;
}

export interface Session {
  id: string;
  course_id: string;
  teacher_id: string;
  title: string;
  scheduled_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  status: SessionStatus;
  questions_paused: boolean;
  qa_window_open: boolean;
  current_topic_id: string | null;
  version: number;
  created_at: string;
}

export interface Topic { id: string; session_id: string; label: string; started_at: string; ended_at: string | null }

export interface Activity {
  id: string; session_id: string; title: string; statement: string; language: string;
  starter_code: string; due_at: string | null; closed: boolean; created_at: string;
}

export interface Pulse {
  session_id: string; understand: number; partial: number; lost: number; joined: number;
  by_topic: Record<string, { understand: number; partial: number; lost: number }>; updated_at: string;
}

/** A student's own help request (RLS: own rows only). */
export interface MyRequest {
  id: string; session_id: string; activity_id: string | null; topic_id: string | null;
  category: RequestCategory; message: string; is_anonymous: boolean; anon_policy: AnonMode;
  is_doubt_bank: boolean; is_blocked: boolean; status: RequestStatus; cluster_id: string | null;
  student_confirmed: "cleared" | "partly" | "not_cleared" | null; identity_revealed: boolean;
  snapshot_id?: string | null; course_id?: string;
  created_at: string; updated_at: string;
}

export interface ThreadMessage {
  id: string; request_id: string; sender_id: string | null; body: string;
  kind: "reply" | "hint" | "guiding_question" | "follow_up" | "system"; created_at: string;
}

/** Row returned by teacher_requests_for_session(). Identity is null for anonymous rows. */
export interface TeacherRequest {
  request_id: string; display_name: string; student_id: string | null; ug_number: string | null;
  is_anonymous: boolean; identity_revealed: boolean; anon_policy: AnonMode;
  category: RequestCategory; message: string; status: RequestStatus; priority: number;
  is_blocked: boolean; is_doubt_bank: boolean; topic_id: string | null; activity_id: string | null;
  cluster_id: string | null; has_code: boolean; student_confirmed: string | null;
  created_at: string; updated_at: string; handled_at: string | null;
}

export interface TeacherThreadMessage {
  id: string; from: "student" | "teacher" | "system"; mine: boolean; kind: string; body: string; created_at: string;
}

export interface SnapshotHeader { id: string; version: number; kind: "autosave" | "request" | "submission"; created_at: string }

export interface Poll {
  id: string; question: string; kind: string; options: string[]; status: "draft" | "open" | "closed" | "revealed";
  allow_change: boolean; require_confidence: boolean; correct: unknown;
  my_response: { response: unknown; confidence: number | null } | null;
}

export interface Cluster { id: string; session_id: string; label: string; addressed_at: string | null; addressed_note: string | null }

export interface NotebookEntry {
  id: string; request_id: string | null; course_id: string; title: string; body: string;
  snapshot_code: string | null; tags: string[]; created_at: string;
}
