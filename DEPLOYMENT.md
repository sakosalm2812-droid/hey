# HEY — Deployment Guide

This document covers the honest shipping path for HEY. Numbers in brackets
(`[§N]`) map to the V3 master transfer specification where relevant.

---

## 1. What "done" means

A feature is **done** only when its path is exercised end-to-end and the result
is visible. The UI never claims an action ran unless the execution layer
confirmed it, and this project treats "works on my machine" as a status tag
(`PARTIAL` / `VERIFIED`), not as release.

Release gate is open when every line in `HUMAN_SHIPPING_CHECKLIST.md` is
checked with evidence.

---

## 2. Environment

Copy `.env.example` to `.env.local` and fill in **only** the Vite-exposed values:

| Variable | Where | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | `.env.local` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | `.env.local` | Public anon key (safe to ship) |
| `VITE_HEY_API_URL` | `.env.local` | Edge function URL |

Provider keys (`OPENROUTER_API_KEY`, `OPENROUTER_MODEL`) are **edge-function
secrets**, never Vite variables. `APP_URL` is used by the edge function for
origins and wake routes.

Do not commit `.env.local`. `.gitleaks.toml` + `npm run secret-scan` is the
pre-commit leak check.

---

## 3. Supabase backend (operator must run)

```bash
npm environment            # prints current env status
supabase start             # local stack (optional, for local verification)
supabase db reset          # apply migrations from scratch
supabase functions deploy hey
supabase secrets set OPENROUTER_API_KEY="sk-or-..."
supabase secrets set OPENROUTER_MODEL="qwen/qwen3-next-80b-a3b-instruct:free"
supabase secrets set APP_URL="https://your-app.example"
```

Required migrations (in order, already in `supabase/migrations/`):

1. `20260819000000_hey_core.sql` — core tables, RLS
2. `20260819010000_hey_platform.sql` — platform/workspace tables
3. `20260819020000_hey_intelligence.sql` — memory/intelligence
4. `20260819030000_add_settings.sql`
5. `20260906000000_security_hardening.sql` — indexes, constraints, policies
6. `20260909000000_idempotency.sql` — idempotency keys
7. `20260909010000_brain_persistence.sql` — persistence relays
8. `20260910000000_vision_logs.sql` — vision observations

Edge function: `supabase/functions/hey/index.ts` (chat, memory, vision, wake,
rate limiting, CORS). Verify with:

```bash
curl -s "<YOUR_URL>/functions/v1/hey/health"
```

---

## 4. Web app

```bash
npm install
npm run lint
npm test               # unit + engine-level journey tests
npm run build          # emits dist/ + sitemap
npm run preview        # verify the production build locally
```

The service worker (`public/sw.js`) registers only in `import.meta.env.PROD`.
Verify offline navigation, cache versioning, and that error pages render
(`/error/500`, etc.). The build script also generates `public/sitemap.xml`.

## 5. Native release matrix

HEY targets web, Windows, macOS, Linux, iOS, and Android. A shared React build
or a successful Windows compile does not prove the other releases.

| Target | Current source state | Required release evidence |
|---|---|---|
| Web | Responsive source builds locally | Production HTTPS deploy plus live backend, browser, service-worker, and permission journeys |
| Windows | Tauri source passes `cargo check` on Windows | Signed installer, clean-machine install/update, and native capability tests |
| macOS | Shared Tauri desktop source | Native macOS build, signing, notarization, install/update, and capability tests |
| Linux | Shared Tauri desktop source | Native Linux packages, clean-machine install/update, and capability tests |
| iOS | Responsive web source and icon assets | Initialized native project, mobile adapters, physical-device tests, signing, and App Store review |
| Android | Responsive web source, CLI support, and icon assets | Initialized native project, mobile adapters, physical-device tests, signed AAB/APK, and Play review |

### Desktop

```bash
npm run tauri:dev
npm run tauri:build
```

Terminal / computer control is a Tauri-only, permission-gated path. Review
`src-tauri/capabilities` before shipping. It cannot be verified in a plain
web runtime — that is a real limitation, not an excuse to claim it works.

### Mobile

The installed Windows CLI exposes Android initialization and build commands:
`npm run tauri:android:init`, `npm run tauri:android:dev`, and
`npm run tauri:android:build`. Run them only on a configured Android SDK host.
iOS initialization and builds require a supported macOS/Xcode host. Neither
native mobile project exists in this checkout yet.

## 6. Content / religious honesty

Hijri dates are tabular estimates (±1 day from moon sighting). Islamic content
is sourced from public APIs and every UI surface explains this. Do not remove
those notes, and do not present religious output as authoritative rulings
without a fatwa/tafsir source.

## 7. What is still the operator's to finalize

- Supabase project, migrations, edge deploy, secrets (see §3)
- Support contact + legal entity + jurisdiction (see `HUMAN_SHIPPING_CHECKLIST.md`)
- Billing integration (pages currently say billing is not configured)
- Verified E2E against the **live** backend
- Device Fabric relay relay (LAN/cloud) and paired Tauri builds
- Native release builds, signing, updates, and hardware verification for
  Windows, macOS, Linux, iOS, and Android

After those, run the checklist and only then flip to a public commercial state.
