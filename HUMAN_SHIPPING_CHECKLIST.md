# HEY — Human Shipping Checklist

Gate: every item below must have **evidence**, not intent. If an item is not
true, HEY is `PARTIAL` / `VERIFIED`, not released. Honestly mark status and
date next to each.

Legend: `VERIFIED` = path exercised with visible result · `PARTIAL` = code
exists, path not fully exercised · `PLANNED` = not built yet · `REQUIRED` =
must be true before public launch.

---

## Engineering quality

- [x] `npm run lint` clean (`eslint .`) — 2026-10-13, [Actions run 38421160443](https://github.com/sakosalm2812-droid/hey/actions/runs/38421160443)
- [x] `npm test` green — 51/51 tests passed, same Actions run
- [x] `npm run build` green (dist/ + sitemap), same Actions run
- [x] Full `npm audit --audit-level=high` reports zero vulnerabilities, same Actions run
- [x] Full-history secret scan clean; Gitleaks reports no leaks, same Actions run
- [x] No leaked `.env.local`, keys, or service-role secrets found in scanned git history, same Actions run
- [x] Clean local Supabase reset applied every migration; local RLS, account-isolation, transcript-role, Forge-history, and 36-request rate-limit concurrency tests passed, same Actions run

## Release requirements (§32)

- [ ] Database-backed per-user rate limiting is implemented and passed a
      clean local 36-request concurrency test (30 allowed, 6 rejected). Verify
      the same behavior across hosted Edge isolates after deployment.
- [ ] Idempotency keys for writes (`20260909000000_idempotency.sql` applied)
- [ ] Unauthenticated `GET /functions/v1/hey/health` is implemented and
      configured; verify reachability/readiness on the hosted deployment.
- [ ] Structured logging (boot logger + audit log) visible on Debug page
- [ ] Error boundaries and `/error/401|403|429|500` pages exercised in PROD
- [ ] Privacy policy, terms, support pages published with real operator data
      (`/privacy`, `/terms`, `/support`)
- [ ] Operator contact, governing entity, and jurisdiction published (Legal
      page currently states this is **not** yet true — `REQUIRED`)

## Product completeness

- [ ] Brain/provider route → execution → memory → receipt journey verified
      end-to-end against a **live** backend (not just local engine)
- [ ] Memory inbox: automatic memories gate, approve/reject works, approval
      persists to the live backend
- [ ] Device Fabric: cross-tab presence + handoff verified; remote pairing
      relay documented or removed from UI claims
- [ ] Double-tap / pinch on Cosmos verified on real touch and desktop input
- [ ] Quran/Hadith live-change sourced ahead of time are attributable; Hijri
      tabular flag visible
- [ ] Billing: pages honest ("not configured") or real integration
- [ ] Voice: TTS voice selection works; wake phrase honored; speech
      recognition is webkit-only and the UI says so

## Accessibility & performance (release bar)

- [ ] Keyboard navigation on primary flows (nav, command palette, forms)
- [ ] Reduced-motion respected (prefers-reduced-motion)
- [ ] Contrast passes on light + dark themes for text-critical surfaces
- [ ] Initial bundle within budget; no heavy chunk below fold
- [ ] Favicon/title/SEO meta present; sitemap generated
- [ ] Tauri capabilities audited before desktop shipping

## Platform release gates

- [ ] Web: production HTTPS deploy passes auth, providers, persistence, voice,
      offline/service-worker, responsive, and browser-permission journeys
- [ ] Windows: signed installer passes clean-machine install, update,
      uninstall, and every declared native-capability journey
- [ ] macOS: native build is signed and notarized and passes install, update,
      uninstall, and every declared native-capability journey
- [ ] Linux: supported packages pass clean-machine install, update, uninstall,
      and every declared native-capability journey
- [ ] iOS: native project and mobile adapters are implemented; signed build
      passes physical-device, permission, background, update, and App Store gates
- [ ] Android: native project and mobile adapters are implemented; signed
      AAB/APK passes physical-device, permission, background, update, and Play gates
- [ ] The Download page links only artifacts that passed the matching gate

## Final gate

- [ ] I ran every journey above against the deployed stack on a clean machine
- [ ] I exported a Debug snapshot and kept it as release evidence
- [ ] No code path claims "verified"/"completed" without its engine confirming
      status — sweep the UI for wording that overstates
