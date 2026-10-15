# Local device command worker

The local command worker is available only inside the supported Tauri desktop runtime. It uses the existing `native_execute` adapter and the authenticated `hey-device-transport` Edge Function. Browser code and remote devices do not run local desktop commands.

Call `startTauriCommandWorkerForAccount` through the core `devices` API with the Supabase Edge Function URL, the UUID of an already enrolled `hey_devices` row, and the active account access token. The worker rotates a per-device credential through the account-authenticated Edge route, keeps that credential in memory, and polls with the device credential. It does not save the raw credential to browser storage.

The worker currently maps these authorized command actions to capabilities implemented by the Tauri adapter: opening URLs and apps, browser navigation, home-directory file read/write/create/list/delete, and terminal execution. It acknowledges a command only when the native adapter returns both `success: true` and `verified: true`. Adapter failures are reported through the queue's bounded retry path. A repeated delivery of a command already verified in the running worker re-sends the acknowledgement without repeating the local action.

Calling the worker's `stop()` stops further polling and waits for the current local action to settle. The account-authenticated device revoke route is the server-side stop: it revokes the credential and cancels pending or leased commands. A native action already running in the desktop process cannot be interrupted by a remote revoke.

The implementation is wired to the existing Windows, macOS, and Linux Tauri command handlers. This change was verified with focused unit and contract tests only; no packaged desktop build, live Supabase deployment, or physical device was exercised.
