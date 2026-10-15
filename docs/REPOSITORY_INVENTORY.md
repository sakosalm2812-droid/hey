# Read-only repository inventory

Run `node scripts/repository-inventory.mjs [repository-directory]` from the project checkout. The command writes a JSON dry-run plan and an `evidence` report to standard output. It requires Git and a cleanly inspectable working tree path; it does not stage files, refresh or rewrite the index, execute SQL, invoke package scripts, install dependencies, or modify source files.

The planner input continues to represent discovered repository paths as existing repository entries. The evidence report is an additive metadata view; it does not turn discovered files into package candidates or authorize replacements.

## Evidence it reports

- Git tracked, dirty, and untracked paths. Dirty working-tree contents and untracked files remain untouched.
- `package.json` allowlisted fields: package name, whether the package version follows the supported semver shape, and direct dependency names/scopes with a broad specifier kind. Raw scripts, configuration values, package/dependency version strings, registry URLs, and file contents are not returned.
- `package-lock.json` lockfile version, count of package entries, and root direct dependency declarations for lockfile versions 2 and 3. The manifest/lockfile comparison checks exact direct declaration text by dependency name and scope but returns no version strings. It does not validate transitive resolution, installability, or runtime compatibility.
- JSON contract candidates under `contracts/`, `contract/`, `schemas/`, or `schema/`, plus JSON files named like OpenAPI/AsyncAPI/schema documents. Only the presence of standard marker fields is reported. YAML and other formats remain unknown.
- SQL files under a `migrations/` path are identified from paths, 14-digit timestamp-style names are grouped to expose duplicate timestamps, and bounded SHA-256 fingerprints support byte-level comparison. SQL text is neither returned, parsed, nor executed.

All reads are bounded: at most 20,000 input paths, 256 candidate files, 256 KiB per file, 8 MiB total, 20,000 JSON nodes, and 32 JSON levels. The report marks invalid, unsupported, oversized, unavailable, or skipped inputs as unknown states. Fingerprints show byte identity only. They do not establish semantic equivalence, safe migrations, completeness, or production readiness. Repository names and dependency names are treated as untrusted data and redacted when they resemble credentials.

The inventory rejects malformed Git records, path traversal, symlinks, and paths outside the repository root. As with other local filesystem inspection, concurrent external edits can race a multi-file scan; individual reads verify size and timestamps around bounded reads, but this is not an atomic repository snapshot.
