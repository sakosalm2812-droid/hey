# HEY final release report

Date: 2026-09-14

## Product identity

- Product: **HEY — Your Second Brain**
- Philosophy: **There are no limits to anything.**
- Current plans: Free, Pro at a planned **$15/month**, and Elite at a planned **$45/month**.
- Paid enrollment remains disabled until secure billing is configured. The interface states this directly.

## Development-plan coverage

The recovered planning archive contains 95 parts from **HEY Development Plan** and 3 parts from **Sharing A Dream**, together covering 977 turns and 1,932 messages. The archive, topic index, attachments, and retrieval-gap ledger remain stored in the private GitHub repository under `docs/history/`.

The source includes routes and foundations for the named HEY experiences from
the plan: HEY Code, HEY Fix, HEY Cowork, HEY Teach, creation and Studio
workflows, Cosmos memory, Forge, Live, device and computer-control boundaries,
tasks, calendar, habits, goals, projects, notes, health, finance, Deen,
onboarding, accessibility, themes, responsive layouts, and native targets.
Presence in source is not presented as live end-to-end verification.

## Release repairs completed

- Account changes synchronously clear in-memory permissions, memory, actions, tasks, skills, audit data, device registrations, and active workflow state before another account is hydrated.
- Supabase auth callbacks no longer await network work while the auth notification lock is held.
- Hydration rejects stale account work and binds cached permissions to the authenticated account.
- Action execution requires authenticated identity, plan entitlement, permission, explicit confirmation, and a verified success result.
- Undo operations use the same authorization and verification boundary.
- Verified workflows stop on reported failure and support cancellation.
- Browser storage access is safe in server-side and test runtimes.
- Provider secrets remain server-side in Supabase Edge Functions.
- Signup cannot grant a paid plan through public user metadata.
- The AI and Studio Edge Functions authenticate the caller and derive plan access from server-side account records.
- Generated Forge paths and content are bounded and screened for unsafe paths and common secret patterns.
- The public product identity and planned pricing match the latest plan while billing remains honest.
- The public Download page covers web, Windows, macOS, Linux, iOS, and Android
  and shows the real release gate for each instead of advertising missing apps.
- Agent definitions fail closed unless a configured provider returns a verified
  success result; the former placeholder-success path was removed.
- Tutorial choreography now uses the supplied registry entry instead of an
  always-empty placeholder.

## Verification observed on the authoritative checkout

- `npm test`: 33 tests passed, 0 failed.
- `npm run lint`: passed with 0 errors.
- `npm run build`: passed; 2,715 modules transformed.
- `cargo check --manifest-path src-tauri/Cargo.toml`: passed.
- Browser verification: homepage loaded with the final identity, 27 selectable themes, complete public navigation, visible memory-control language, and working route targets.
- Pricing verification: Free is available; Pro and Elite display $15/month and $45/month as planned prices with enrollment disabled until billing is configured.
- Repository verification before update: `sakosalm2812-droid/hey` is private, visibility is private, and GitHub Pages is disabled.

## External launch dependencies

These cannot be truthfully marked complete from a source checkout:

1. Deploy the Supabase migrations and both Edge Functions to the production project.
2. Configure production Supabase URL and anonymous client key.
3. Configure at least one server-side AI provider key; configure search, voice, and Studio provider keys for those experiences.
4. Configure the production app origin for CORS and password-reset redirects.
5. Run live account tests for signup email, login, reset email, account switching, memory persistence, AI replies, Studio generation, and plan enforcement.
6. Integrate and verify a secure billing provider before enabling Pro or Elite enrollment.
7. Set the production HTTPS site URL so sitemap generation can emit the final canonical sitemap.
8. Complete signed Windows, macOS, and Linux builds plus update-channel and
   device-permission testing on native target hardware.
9. Initialize the iOS and Android native projects, implement their platform
   adapters, and complete physical-device, signing, update, and store tests.

Until those production systems and all six platform gates are configured and
observed, the repository is a verified source release candidate rather than a
verified live production deployment or a complete multi-platform release.

## Archive limits

The archive contains every chat item the available interfaces returned. Eighteen long assistant responses were truncated by the source interface at 20,000 characters, and some historical attachments were unavailable. Exact affected turns and missing items are listed in `docs/history/RETRIEVAL-GAPS.md`; no missing content is presented as recovered.
