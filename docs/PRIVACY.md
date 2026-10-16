# Privacy (draft)

Stored: name, UG number, role; understanding signals (latest value only); help requests and replies; code drafts, snapshots
and submissions; private notebook entries; exit tickets; aggregate pulse history; audit log.

Who sees what: students see only their own rows. Teachers see requests of sessions in courses they teach, with identity
hidden for anonymous requests according to the course anonymity mode (identified / masked / strict). Teacher notes are
never visible to students. Admin break-glass reveal needs a written reason and is audit-logged.

Retention (proposed defaults, not yet enforced by jobs): drafts/snapshots 1 academic year; per-student signals 90 days
then aggregated. `admin_purge_user` deletes an account and everything it owns on request.

No third-party analytics, no AI services, no code execution.

Students can hide their private weekly view (stored only in their browser), delete notebook entries, and are told when an anonymous question is revealed.
The service worker caches static files only. Drafts and the notebook copy are stored in the browser's IndexedDB and cleared on sign-out.
