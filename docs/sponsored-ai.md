# Sponsored AI: decision notes

Date: 2026-09-29. Decision record and implementation notes. Mobile authentication alternatives are research only, not device-verified.

## Direction

**Selected direction:** public app + fully public sponsored AI + optional bring-your-own-key (BYOK). No login/invitation required for sponsorship. Approved after a short grilling: $10/month via an enforced OpenAI platform limit only; no app quotas, bot checks or login. Show request failures and retain source. Sponsored is the default; switching to BYOK is explicit, never automatic. No existing-user migration needed.

## Existing app and common backend work

- Solid/Vite PWA, Dexie local notebook, Cloudflare Workers Static Assets; a small `src/worker.ts` now handles public sponsorship. `src/providers/openai.ts` uses same-origin sponsored routes by default, or calls OpenAI directly using a session-only/optionally localStorage-persisted personal key when explicitly selected.
- Sponsorship requires a Worker backend holding the owner's key as a runtime secret; never a `VITE_` variable or browser-delivered credential. Keep BYOK direct to OpenAI.
- Expose only application-specific generation/transcription operations. Enforce model, prompt/schema and per-request input/audio/output bounds server-side. No concurrency counters, rate quotas or app spending ledger: platform enforcement is the chosen spending control.
- Keep notebooks local and iCloud backup separate. Sponsored processing adds our Cloudflare backend to the data path; avoid logging/storing notes or audio. Authentication would not provide notebook synchronization.
- Use a dedicated OpenAI project, spend alerts and enforced spend limit. OpenAI documents delayed enforcement/possible slight overshoot; alerts alone do not stop traffic. Owner explicitly chose no application quota or spending ledger. No automatic retries or payer fallback.
- Public sponsorship means accepting that strangers can consume the shared budget. IP limits penalize shared networks and can be evaded; browser identifiers can be reset. No reliable per-person quota without identity. CORS/origin checks do not authenticate a caller.
- Keep manual/offline use available when sponsorship is exhausted. Offer BYOK explicitly; avoid silently switching which party pays.

## Alternatives considered

| Access option               | Tradeoff                                                                                                                                                                                                                                                                            |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Private invite links/codes  | No auth vendor seat fee; small custom session/revocation system. Bearer invites can be forwarded; recovery/new-device activation needs design.                                                                                                                                      |
| Shared family code          | Smallest gate, but shared quota and revocation affect everyone.                                                                                                                                                                                                                     |
| Cloudflare Access email OTP | Protect only sponsored routes; public/BYOK users need no login. Free up to 50 users across Zero Trust account; paid advertised at $7/user/month. Seats persist until removed, not concurrent users. Sessions configurable up to one month. Poor cost fit for growing public access. |
| WorkOS AuthKit              | Auth free up to 1M MAU; hosted login or email-code API. Managed-login preference if identity later becomes necessary; custom in-app code entry avoids link-routing dependencies.                                                                                                    |
| Clerk                       | Free up to 50K monthly retained users; free sessions fixed at seven days.                                                                                                                                                                                                           |
| Supabase Auth               | Free up to 50K MAU; Pro from $25/month. Production email needs custom SMTP. More infrastructure than needed solely for this app's login.                                                                                                                                            |

Prices are a dated snapshot; verify before adoption. Authentication is separate from OpenAI and Workers costs. Workers Free: 100K requests/day, 10 ms CPU/invocation; Paid starts at $5/month. Measure CPU for audio handling/validation rather than assuming Free suffices.

## PWA constraints: iOS and Android

- External email/invite links cannot be relied on to reopen an installed iOS PWA; they may authenticate Safari or an in-app browser instead. Android Chrome WebAPK installs handle in-scope links more naturally, but browser defaults, installation type and messaging-app browsers still vary.
- iOS 17.2+ copies cookies when installing a Home Screen web app, **not localStorage/IndexedDB**; later browser/PWA sessions and data remain separate. Cookie-based login before install can transfer once. Browser notebook data and remembered BYOK do not automatically follow.
- Prefer installation before substantial use; existing browser notebooks need export/import or backup restoration. Login is not data migration.
- Reliable optional auth: start inside PWA, enter emailed code there, establish first-party session. Hosted cross-origin login can work but callback/window/session behavior needs real-device testing.
- If using invites, support code entry/pasting inside the installed app. Do not strand users by consuming a single-use invite in the wrong browser; define recovery and additional-device behavior.
- Future server login/callback routes must bypass current Workbox navigation fallback (`vite.config.ts`). Persist pending state/drafts before switching apps; app can reload while user checks email. Never cache auth/private API responses.
- Test actual iOS + Android installs, login before/after install, app switching/relaunch, session expiry, storage clearing, and email/messaging links. Desktop emulation is insufficient. Public sponsorship removes login routing problems, not local-data/install differences.

## Sources

- OpenAI: [spend limits](https://developers.openai.com/api/docs/guides/spend-limits).
- Cloudflare: [Worker/path Access](https://developers.cloudflare.com/workers/configuration/cloudflare-access/), [pricing](https://www.cloudflare.com/plans/), [seats](https://developers.cloudflare.com/cloudflare-one/team-and-resources/users/seat-management/), [sessions](https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/), [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/).
- Auth: [WorkOS pricing](https://workos.com/pricing), [WorkOS email codes](https://workos.com/docs/authkit/magic-auth), [Clerk pricing](https://clerk.com/pricing), [Supabase pricing](https://supabase.com/pricing), [SMTP requirements](https://supabase.com/docs/guides/auth/auth-smtp).
- PWA: [WebKit cookie copying/storage isolation](https://webkit.org/blog/14787/webkit-features-in-safari-17-2/), [URL handling](https://web.dev/learn/pwa/os-integration), [authorization windows](https://web.dev/learn/pwa/windows).

## Implementation and activation

- `src/worker.ts`: only `/api/ai/generate` (POST), `/api/ai/transcribe` (POST), `/api/ai/check` (GET). Fixed model/schema/prompt from `openai-contract.ts`; sanitized provider failures; no payload logging/storage; no-store API responses.
- Request bounds: 20K source characters, 2 MiB total generation JSON, 12 candidates, 5K contexts/name-index entries; 25 MiB audio plus bounded multipart overhead; existing language/keyword bounds. These protect request handling, not monthly spending.
- Device-local `ahthatswho.ai-mode` defaults to sponsored and is excluded from notebook exports. Saved personal keys are ignored in sponsored mode. Missing personal key remains an error in personal mode.
- Settings exposes payment mode and model-access check; capture errors persist in Inbox with source/audio intact. Model-access check does not prove remaining inference budget.
- Deploy with Worker runtime secret `OPENAI_API_KEY`; configure its dedicated OpenAI project's **enforced** $10 monthly limit before public activation. Missing secret returns a visible 503; no credentials are bundled. See [deployment](deployment.md).
- Development: build static assets, run `mise exec -- wrangler dev --port 8787`, then Vite dev (proxies `/api` there); `.dev.vars` is ignored. Static-only preview needs mocked API or a running Worker for sponsorship.
- Automated verification uses synthetic data/mocked OpenAI, including backend option pinning, upload limits, failures, default sponsorship, explicit BYOK and note/audio recovery. It does not establish live account access or real iOS/Android behavior.
