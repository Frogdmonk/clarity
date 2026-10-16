# Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| "Pending approval" after sign-up | Account not verified | Admin approves in /admin (or import roster with roster mode) |
| Login works, redirected back to login | Redirect URLs not set in Supabase Auth | Add `/auth/confirm` and `/auth/callback` URLs |
| Confirmation email never arrives | Free SMTP rate limits | Wait; or configure custom SMTP; locally use Inbucket |
| Connection badge stuck on "Reconnecting" | Realtime disabled, public access still on, or `realtime.send` signature mismatch | See KNOWN_LIMITATIONS; the app still works via polling |
| Student sees "Class not found" on join | Code expired/rotated or typo | Teacher uses "New join code" |
| "Too many attempts" | Rate limit on joins/questions | Wait a minute |
| Code editor shows "Saved elsewhere" dialog | Same activity open on two devices | Choose which version to keep; the other is kept in history |
| Teacher can't see names | Masked/strict anonymity | Course settings; masked allows an audited reveal |
| /api/health returns 503 | Wrong env vars or project paused | Check env; resume the Supabase project |
| Build fails on env | Missing `NEXT_PUBLIC_*` | Set them (see .env.example) |
