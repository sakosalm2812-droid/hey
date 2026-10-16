# Native device command authorization

## Current behavior

Rust rejects every `native_execute` IPC call and reports an empty `native_capabilities` list. The Tauri renderer adapter now mirrors that empty list, freezes it against accidental additions, and returns an unsupported result before IPC for every capability. This includes browser opening, app launch/navigation, filesystem operations, terminal execution, and system information. Renderer-supplied authorization fields cannot bypass the gate: native authorization state is not derived from renderer input, and the command accepts no permit parameter.

This is intentionally fail closed. JavaScript policy checks, backend command leases, and a capability list do not prove that a specific native side effect is authorized at the Tauri boundary. The current repository has no server-side signing key, signed permit format, native signature verifier, or native one-use/revocation ledger. The device transport authenticates credentials and fences queue RPCs, but does not issue a cryptographically verifiable authorization for each exact native operation.

## Required trust seam before re-enabling commands

1. The authenticated Edge service validates the account, registered device, current permission/mandate, authorization epoch, target capability, and exact canonical input. It issues a short-lived, one-use permit signed by a server-held key. The signed payload binds account ID, device ID, device credential digest or key identity, authorization epoch, capability, canonical input digest, nonce, and expiry.
2. The Tauri main process verifies that signature against a pinned public key, recomputes the exact input digest, checks account/device/session context, enforces expiry, and atomically consumes the nonce in native-owned storage. Renderer-supplied booleans, unsigned claims, or permit fields are never authority.
3. Revocation invalidates the authorization epoch and is checked at the last possible native execution boundary. If offline operation is required, define a bounded revocation freshness policy; otherwise, native execution stays online-only and fails closed when the verifier cannot confirm current authority.
4. Before any capability is advertised, Rust tests must cover direct IPC denial, invalid signatures, replay, expiry, wrong account/device/epoch/capability/input digest, and revocation between permit verification and dispatch.

No signing key, permit issuer, or verifier is configured in this branch, so no forgeable renderer flag or placeholder permit has been added. Rust tests are present but cannot be run in this environment because `cargo` and `rustc` are unavailable. A source-level JavaScript regression test verifies the Rust fail-closed guard and capability list.
