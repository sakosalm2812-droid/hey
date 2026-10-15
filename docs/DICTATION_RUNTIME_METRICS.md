# Dictation Runtime Metrics

`createDictationSession` accepts an optional `onMetrics` callback. It receives one frozen summary for each consented start attempt when that attempt ends, errors, or is cancelled. The summary contains only:

- schema version, provider class (`browser`, `custom`, or `unavailable`), and a stable terminal status;
- startup latency, first accepted transcript latency, and total attempt duration in milliseconds when the runtime clock provides usable values;
- accepted and empty transcript callback counts, each capped at 1,000.

The startup measurement includes microphone permission time. First transcript latency starts immediately before the provider's `start` method. Values are rounded to whole milliseconds and clamped to one day. The runtime uses `performance.now()` when available and otherwise falls back to the wall clock; negative clock movement is reported as zero.

The summary never includes transcript text, provider error messages, account identifiers, or a session identifier. Metrics stay in memory and are delivered only to the caller that supplied the callback. The dictation runtime does not persist, aggregate across sessions, transmit, or display them. A throwing metrics callback is ignored so it cannot interrupt dictation.

Terminal statuses are `ended`, `stopped`, `account_changed`, `cancelled`, `permission_failed`, `unavailable`, `offline`, `recognition_error`, and `start_failed`. Provider quality scores and end-to-end user-perceived latency are not inferred from these measurements.
