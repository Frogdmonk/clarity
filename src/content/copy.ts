/**
 * Central copy deck. Tone rules (design doc 2.4): normalise asking, plain verbs, never judgemental.
 * Banned words are enforced by copy.test.ts.
 */
export const copy = {
  brand: "Clarity",
  tagline: "Asking is how the class improves.",
  normalise: "Most lectures have a few people stuck on the same thing.",
  signal: {
    heading: "How are you following?",
    understand: "Following",
    partial: "Partly",
    lost: "Lost",
    sent: "Marked. Thanks for letting your teacher know.",
    othersOnTopic: (n: number, topic: string) => `${n} others are also lost on ${topic}.`,
    pulseHidden: "Mark how you're following to see how the class is doing.",
  },
  ask: {
    button: "Ask privately",
    later: "Ask later",
    placeholder: "I understand the example but can't solve this question.",
    blocked: "I'm blocked and can't continue",
    sent: (teacher: string) => `Sent. ${teacher} will see this at the next pause.`,
    receipt: (pos: number) => `Position ${pos} in the queue.`,
    classmates: (n: number) => `${n} classmates asked something similar.`,
    paused: "Your teacher has paused questions for now. You can use Ask later after the lecture.",
    qaOpen: "Your teacher is reading questions now.",
    tooMany: "You already have 3 open questions here. Your teacher will get to them soon.",
  },
  anon: {
    label: "Ask anonymously",
    identified: "Your teacher will see your name.",
    masked:
      "Classmates never see who asked. Your teacher sees you as 'Student #A7' unless they choose to reveal your name; you'll be told if they do.",
    strict:
      "Your teacher cannot see your name. In serious safety cases a platform administrator can, and it's recorded.",
  },
  closeLoop: {
    prompt: "Did this clear it up?",
    cleared: "Yes, cleared",
    partly: "Partly",
    notCleared: "Not yet",
    saveOffer: "Add to My Clarified Doubts?",
    addressed: "Your question was addressed in class.",
    revealed: "Your teacher chose to see your name for this question.",
  },
  status: { open: "Open", in_progress: "In progress", handled: "Handled", reopened: "Reopened" },
  errors: {
    generic: "Something went wrong. Your work is safe; please try again.",
    auth: "Check your details and try again.",
    offline: "You're offline. Changes are stored on this device and will sync automatically.",
    busy: "The service is busy. Your work is saved on this device and will sync automatically.",
    rate_limited: "You're going a little fast. Please wait a moment and try again.",
    permission_denied: "You don't have access to that.",
    not_verified: "We're still checking your details.",
    not_enrolled: "You're not enrolled in that course.",
    not_member: "Join the session first.",
    session_not_live: "That session isn't live right now.",
    session_ended: "That session has ended and its Doubt Bank has closed.",
    invalid_or_expired: "That code didn't work. Check it or ask your teacher for a new one.",
    paused: "Questions are paused right now.",
    too_many_open: "You already have 3 open questions here.",
    already_changed: "Someone else changed this just now. Showing the latest.",
    activity_closed: "This activity is closed. Your earlier work is kept.",
    deadline_passed: "The deadline has passed. Your earlier work is kept.",
    already_responded: "You've already answered this.",
    poll_closed: "This poll is closed.",
    confidence_required: "Choose how sure you are first.",
    strict_mode: "This course uses strict anonymity; names can't be revealed.",
    too_large: "That's too large to save.",
    not_found: "We couldn't find that.",
    invalid_transition: "That change isn't allowed from the current status.",
    invalid_state: "That isn't possible right now.",
    invalid_input: "Please check what you entered and try again.",
    reason_required: "Please give a reason (at least 10 characters).",
    cannot_change_self: "You can't change your own account here.",
    invalid_note: "Write a short note (up to 500 characters).",
  } as Record<string, string> & Record<"generic" | "auth" | "offline" | "busy", string>,
  teacher: {
    pulseDip: (topic: string, pct: number) =>
      `Many are lost on ${topic} (${pct}%). Pause and recap?`,
    templates: [
      "What do you expect line {n} to return? Walk me through it.",
      "Try tracing the values by hand for a tiny input. What changes on each step?",
      "Which part of the example makes sense, and where does it stop making sense?",
      "Good question. Let's look at this together after class: what did you try so far?",
    ],
  },
  empty: {
    questions: "No questions yet. That's fine. Ask anytime.",
    notebook: "Nothing saved yet. After a doubt is cleared, you can keep it here.",
    sessions: "No sessions yet.",
    queue: "Nothing waiting. Nice.",
  },
} as const;

export function errorMessage(code: string | undefined | null): string {
  if (!code) return copy.errors.generic;
  return copy.errors[code] ?? copy.errors.generic;
}
