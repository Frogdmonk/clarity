# Free-tier notes

Limits change. **Verify on deploy day** at supabase.com/pricing and vercel.com/pricing before relying on any number.

What to check:
- Supabase: database size, monthly active users, Realtime concurrent connections and messages/second, egress,
  and the inactivity pause rule (handled by the keep-alive workflow).
- Vercel (Hobby): non-commercial use only, function duration, bandwidth.

Design choices that keep usage low:
- Realtime is a hint only; clients poll every 5-15 s as fallback, so a dropped channel does not break the app.
- Pulse is sampled lazily (one row per 30 s while live), not per tap.
- Draft saves are debounced and use compare-and-swap; autosave snapshots are throttled.
- No images, no uploads, no external fonts.
- Roughly one Realtime connection per open tab, with at most 2 channels per tab.

If a class outgrows the free tier, the first lever is the Realtime connection cap (split sections across sessions) or upgrading Supabase.
