# HEY

HEY is a React/Vite personal intelligence system with Supabase authentication,
memory, chat persistence, and a Supabase Edge Function backed by OpenRouter.

## Local setup

1. Copy `.env.example` to `.env.local` and add your Supabase project values.
2. Run the SQL in `supabase/migrations/20260819000000_hey_core.sql`, `supabase/migrations/20260819010000_hey_platform.sql`, `supabase/migrations/20260819020000_hey_intelligence.sql`, `supabase/migrations/20260909000000_idempotency.sql`, and `supabase/migrations/20260909010000_brain_persistence.sql` in the Supabase SQL editor, or apply all five with the Supabase CLI.
3. Set the Edge Function secrets:

   ```text
   supabase secrets set OPENROUTER_API_KEY=your-key
   supabase secrets set OPENROUTER_MODEL=qwen/qwen3-next-80b-a3b-instruct:free
   supabase secrets set APP_URL=http://localhost:5173
   supabase secrets set TAVILY_API_KEY=your-key
   ```

   `TAVILY_API_KEY` enables HEY's real web research tool. If Tavily is not
   available, set `BRAVE_SEARCH_API_KEY` instead. Search keys stay server-side
   and are never exposed to the browser.

4. Open `/permissions` after signing in to review memory, web research, voice,
   proactive, and device-control permissions.

5. Deploy or run the function locally with the Supabase CLI:

   ```text
   supabase functions serve hey
   supabase functions deploy hey
   ```

The default model is Qwen3 Next 80B A3B Instruct through OpenRouter’s free
model access. Change `OPENROUTER_MODEL` to another available free model when
needed.

## Forge

Forge uses the same authenticated Edge Function and model to generate usable
files from a brief. Generated files are saved as `project` records in
`hey_records` and `hey_forge_runs`, validated on the server and client, previewed
in the Forge UI, and downloadable individually or together. Forge never executes
generated code on the server. If the provider returns malformed or empty output,
Forge returns a validation error instead of fabricating a placeholder file.

## Reliability boundaries

- Tool retries are bounded to three attempts and occur only for failures marked
  transient/retryable or carrying retryable HTTP status codes (`408`, `425`,
  `429`, or `5xx`).
- Every unsupported native capability returns `success: false` and
  `verified: false` until a trusted platform adapter is installed.
- Mode analysis resolves definitions through the centralized mode registry so
  registered modes remain available to the intelligence pipeline.

## HEY systems

- `/capabilities` contains the 100-capability HEY product map.
- `Ctrl+K` or `Cmd+K` opens the universal command palette.
- Memory relationships, action runs, quality reports, and Forge history use the
  intelligence migration and remain protected by Supabase row-level security.
- `/voice` is the public voice experience; `/voice/live` is the authenticated app
  voice experience.

## Computer control foundation

The central core exposes capability discovery, computer tools, native adapter
injection, bounded verified execution, reusable skills, and morning briefings.
Browser-safe system information, URL opening, and display capture use browser
permissions. Native application, filesystem, terminal, window, keyboard,
mouse, OCR, and hardware operations return an explicit unavailable result until
a trusted Windows, macOS, or Linux adapter is installed through
`HEY.computer.setAdapter` and `HEY.devices.registerAdapter`.

Capability discovery is cross-platform: `HEY.capabilities.availability(id,
platform, adapter)` reports `supported`, `unsupported`, `permission_required`,
or `restricted`. A capability is executable only when the selected adapter
declares it and returns a verified result. Android and iOS adapters are accepted
by the core, but no mobile adapter is bundled; OS-restricted operations therefore
remain unavailable until an appropriate native implementation is installed.

The Tauri v2 native foundation lives in `src-tauri/`. Use `npm run tauri:dev`
for a desktop development shell and `npm run tauri:build` for the current
desktop platform. Android commands are exposed as `npm run tauri:android:init`,
`npm run tauri:android:dev`, and `npm run tauri:android:build`.
Rust and the platform SDK/toolchain must be installed before either command can
produce a native binary. The current bridge implements system information, URL
opening, and home-directory-scoped filesystem operations; application control,
terminal execution, screenshots, notifications, and media remain unavailable
until their dedicated native implementations are added. Terminal execution is
allowlisted and bounded in the Tauri bridge. Its Rust source passes `cargo check`
on Windows; this does not verify a signed installer or another operating system.

HEY's release targets are web, Windows, macOS, Linux, iOS, and Android. The
responsive web source and shared six-platform capability model are present.
Desktop bundles must be built and tested on each target OS. Native Android and
iOS project shells and mobile adapters are not initialized in this checkout, so
the mobile apps are release gates rather than completed downloads. See
`src/core/platformMatrix.js` and `HUMAN_SHIPPING_CHECKLIST.md`.

Run `npm run environment` for a local toolchain report before attempting native
development or release builds.

Sensitive operations remain behind the existing permission and audit layers;
the verified execution loop stops after three attempts and never treats an
unverified result as success.

## Checks

```text
npm run lint
npm test
npm run build
```

## Sitemap

The production build runs `scripts/generate-sitemap.mjs` before Vite. It writes
`public/sitemap.xml` for the public routes only when `SITE_URL` is an absolute
https URL (for example `SITE_URL=https://hey.app npm run build`). Without
`SITE_URL`, generation is skipped so local builds never ship a placeholder
domain.

## Publishing checklist

1. Build the app with `npm run build` and deploy the generated `dist` folder to a static host.
2. Configure production `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_HEY_API_URL` in the host environment.
3. Set `SITE_URL` so the sitemap and social meta resolve to the real deployed origin at build time.
4. Deploy the `hey` Supabase Edge Function and set its server-side model, search, and `APP_URL` secrets.
5. Apply all five migrations, enable the production auth providers and redirect URLs, then verify RLS policies with a real account.
6. Test sign-in, chat, memory, search, Forge downloads, voice permissions, and the install experience on iOS Safari and Android Chrome over HTTPS.
7. Build, sign, install, and test Windows, macOS, and Linux desktop packages on their native operating systems.
8. Initialize and implement the iOS and Android native projects, then pass physical-device, signing, update, and store-review gates.
