# Local device command worker

The local command worker is available only at the configured Tauri production origins (`tauri://localhost` on macOS and Linux, and `http://tauri.localhost` on Windows). It uses the existing `native_execute` adapter and the authenticated `hey-device-transport` Edge Function. Browser code and remote devices do not run local desktop commands.

Call `startTauriCommandWorkerForAccount` through the core `devices` API with the Supabase Edge Function URL, the UUID of an already enrolled `hey_devices` row, and the active account access token. The worker rotates a per-device credential through the account-authenticated Edge route, keeps that credential in memory, and polls with the device credential. It does not save the raw credential to browser storage.

The worker currently maps these authorized command actions to capabilities implemented by the Tauri adapter: opening URLs and apps, browser navigation, home-directory file read/write/create/list/delete, and terminal execution. Before native execution, it reserves the command in the database. After a verified postcondition, it records the result durably before sending the acknowledgement. A restarted worker re-sends the acknowledgement for a verified result without repeating the local action. If the prior process stopped after reserving but before recording a verified result, retries fail closed and never repeat the action.

Calling the worker's `stop()` stops further polling and waits for the current local action to settle. The account-authenticated device revoke route is the server-side stop: it revokes the credential and cancels pending or leased commands. A native action already running in the desktop process cannot be interrupted by a remote revoke.

The implementation is wired to the existing Windows, macOS, and Linux Tauri command handlers. This change was verified with focused unit and contract tests only; no packaged desktop build, live Supabase deployment, or physical device was exercised.
