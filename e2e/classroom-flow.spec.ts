import { test } from "@playwright/test";

// Full flow (teacher starts a session, student joins with the code, asks a question, teacher replies,
// student confirms) requires seeded accounts from supabase/seed.sql and a live local stack.
test.fixme("teacher↔student classroom round trip", async () => {
  // 1. teacher@example.test logs in, opens course, creates + starts session, reads join code
  // 2. student@example.test logs in in a second context, joins with the code, taps "Lost", asks a question
  // 3. teacher sees the question in the queue, replies, marks handled
  // 4. student sees the reply and confirms "cleared"
});
