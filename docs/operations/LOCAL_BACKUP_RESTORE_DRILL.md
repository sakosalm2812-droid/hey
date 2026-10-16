# Local backup and restore drill

Run the synthetic rehearsal from the repository root:

```sh
npm run drill:backup-restore
```

The harness creates three synthetic files under a newly allocated operating-system temporary directory, writes a versioned manifest with per-file SHA-256 digests, validates the complete backup before restoring any file, compares the restored file set and bytes with the source fixture, and removes its temporary directory on exit. It prints a JSON result; a failed rehearsal exits nonzero.

Run the focused adversarial suite with:

```sh
node --test tests/local-backup-restore-drill.test.js
```

The tests inject payload corruption, a missing backup file, an unlisted extra file, and a path traversal manifest entry. Each case must fail closed with zero restored files. Fault injection is available only through the test API; the CLI always runs the clean rehearsal.

This verifies only the local harness over synthetic files. It does not exercise HEY production databases, object storage, encryption/key custody, live backup scheduling, deployment rollback, or disaster recovery. Passing it is not production backup evidence.
