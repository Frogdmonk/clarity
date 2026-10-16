-- The client never supplies student_id; the RLS check (student_id = auth.uid()) enforces ownership.
alter table public.notebook_entries alter column student_id set default auth.uid();
