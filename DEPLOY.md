# Ava Web-Chat — brasstacks.space Deploy Checklist

Brass Tacks' own web-chat Ava: Claude-powered widget, Brass Tacks knowledge
base, `[[GO]]` take-me-there navigation, `[[LEAD]]` capture. Same Ava as the
voice line, now on the website.

## Files (in this folder, mirrored into the brasstacks repo on deploy)
| Local | Repo destination |
|---|---|
| `kb/brasstacks.md` | `kb/brasstacks.md` (reference; KB text is also embedded in `api/chat.js`) |
| `api/chat.js` | `api/chat.js` (Vercel serverless function) |
| `assets/ava-chat.js` | `assets/ava-chat.js` |
| `assets/ava-chat.css` | `assets/ava-chat.css` |
| `SNIPPET.html` | paste into ONE page before `</body>` to start (hidden test page ideal) |

## Steps
1. **Vercel env vars:** in the `brasstacks` Vercel project, add
   `ANTHROPIC_API_KEY` (server-side only, never touches the browser).
   Optional: `ANTHROPIC_MODEL` to override the default (`claude-sonnet-4-5`).
   Optional: `LEAD_WEBHOOK_URL` for push lead alerts (any JSON POST endpoint:
   Discord/Slack webhook, Zapier, etc.). Unset = leads log to Vercel logs only.
   **Caller memory ("remember me"):** needs a Supabase project (free tier is
   plenty). Run `supabase/schema.sql` once in the Supabase SQL editor, then add
   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (the service_role key, NOT the
   anon key; server-side only). `CALLER_MEMORY_SECRET` is set by Kraimer via the
   Vercel API and never lives in the repo. Without the Supabase vars, the widget
   and voice agent simply skip recognition features; everything else works.
2. **Push the files** to `stndfella42-code/brasstacks` on `main`
   (Kraimer does this via the GitHub API on your go-ahead). Auto-deploy picks
   it up; `/api/chat` goes live with the deploy.
3. **Add the snippet** to one page first. Suggested: a hidden test page
   (e.g. `test-ava.html`, noindex) so the live site never shows a half-baked
   Ava. Roll to homepage/services after it proves out.
4. **Design freeze note:** this adds a floating chat bubble only. No layout,
   hero, or page-structure changes, so the freeze holds.

## Test script
- Open the test page, click the Ava button.
- "How much is a website?" → short answer with real pricing, no em dashes.
- "Do you have anything for restaurants?" → mentions Assay demo + a
  "See the demo" button. Click it → lands on /demos/assay-brewing/.
- "How does the AI receptionist work?" → GO button to
  /services.html#ai-receptionist.
- "I'd like a free consult" → collects name + contact, then check Vercel
  logs for the `[ava-chat-bt] LEAD` line.
- "Who is Ryan's employer?" → "Fortune 50 health insurer", never the name.
- Ask something unanswerable ("do you fix cars?") → offers to pass it to Ryan.
- Mobile: panel fits, bubble doesn't cover content badly.

## Cost
Per conversation: fractions of a cent in Claude API fees. Effectively zero
at current volume.

## What this is NOT yet
- Multi-tenant (per-client KB/branding) — the KwK pilot and this one are
  separate deploys for now; unify when selling it.
- Transcript persistence — replies log the latest question to Vercel logs only.
- Hardened API — pilot-grade throttling; add auth + PII policy before
  selling to clients.
