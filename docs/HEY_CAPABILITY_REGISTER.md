# HEY Capability Register

This register describes what can be used in the running application, with evidence separated from code and unit-test claims. It is a focused delivery register for the first user journeys, not a replacement for the 47-step evidence map.

## Current local application

- URL: `http://127.0.0.1:5173/` (available while the current Vite session is running).
- Start from the repository root with `npm run dev -- --host 127.0.0.1`.
- Browser-verified surface: public home page; the Appearance theme selector changed to **Ocean**, and the selected value remained **Ocean** after a browser reload.
- The local app has no `.env`, Supabase CLI, Docker CLI, Supabase URL/key, or OpenRouter key configured in this environment. The UI is real, but account, database, and provider journeys cannot be live-verified here.

## Capabilities

| Capability | Status | User action and entrypoint | Integration and evidence | Blocker / exact missing work | Owner |
|---|---|---|---|---|---|
| Public HEY home and appearance theme | **VERIFIED WORKING** | Open `/`; use the Appearance theme selector and select Ocean. | Browser interaction showed Ocean selected; reload retained Ocean. Theme state uses `ThemeContext` and browser local storage; theme token tests exist in `tests/theme-studio.test.js`. No external service is required for this preference. | This verifies the public shell and theme preference only; it does not verify account, database, or AI services. | Frontend Director |
| Account registration and sign-in | **PARTIAL** | `/signup` and `/login`. | `AuthContext.jsx` calls Supabase Auth through `src/lib/supabase.js`. The client intentionally returns a configuration error when URL/key are absent. No credentials were entered or sent during this checkpoint. | Supply a Supabase project URL and public anon key through the local ignored `.env` file; deploy/configure auth and email settings; then verify signup, confirmation, sign-in, sign-out, recovery and account isolation against that project. Never put service-role or provider secrets in Vite variables. | Onboarding / Spaces |
| AI chat and model selection | **PARTIAL** | `/chat` (requires sign-in). | `ChatPage.jsx` calls `askHEY` in `src/lib/heyAI.js`; the request targets the configured HEY Edge Function, carries the signed-in session, and handles cancellation/provider errors. | Configure Supabase and deploy the `hey` Edge Function with an authorized provider secret; verify real inference, saved conversation history and account isolation in the browser. No provider key or live inference is available in this environment. | HEY One / Models; Frontend Director for UI |
| Custom Spaces and saved tool selection | **PARTIAL** | `/spaces` (requires sign-in). | `SpacesPage.jsx`, account-scoped Space storage and focused worker tests are present in the development branch. | Live Supabase persistence, cross-session reload, membership isolation and a browser journey remain unverified. Requires configured Supabase and a test account. | Onboarding / Spaces |
| Authorized tool action and activity history | **IMPLEMENTED BUT UNVERIFIED** | `/chat` and `/tools`. | Capability registry, permission checks, execution preview, confirmation and result contracts have unit/security coverage. | No live authorized integration target or account is configured. Verify one low-risk real action, explicit permission denial, persisted activity and independent postcondition in the browser. | Tool Library; integration coordinator |
| HEY Flow dictation | **IMPLEMENTED BUT UNVERIFIED** | Chat composer voice control. | Browser speech provider and edit-proposal handling exist with focused tests. | No browser/device end-to-end run or microphone permission was granted. Verify on a supported browser after explicit microphone approval and confirm privacy/error behavior. | HEY Flow |
| VoiceOS and computer/device control | **IMPLEMENTED BUT UNVERIFIED** | Voice/action controls and Device Center. | Mandate/permission contracts, device queue and reversible-action checks have focused tests. | No native companion, enrolled device, independent observer or real operating-system action is available. Do not describe web UI as native support. | VoiceOS / Edge |
| Teacher lessons and artifacts | **IMPLEMENTED BUT UNVERIFIED** | Teacher Mode / Learn and Forge. | Lesson/worksheet/answer-key contracts have focused tests. | Live persistence, teacher/student permission boundary and browser export journey need a configured account and end-to-end verification. | Teacher Experience |

## Verification boundary

No account, external database, AI provider, authorized third-party action, or native-device journey is marked verified working in this environment. The local URL is a development server, not public HTTPS staging. Configure real services through the deployment dashboard or a locally ignored environment file; do not send secrets in chat or commit them.
