# Teacher answer-key access contract

HEY identifies an answer key from `content` fields named `teacherAnswer`, a student worksheet from `content.type === "teacher_worksheet"`, and a teacher lesson from its lesson content shape. The `audience` and other metadata do not grant access. The canonical HEY artifact read, list, version, history, comparison, and export paths require `supabaseClient.auth.getUser()` to return an authenticated user with server-managed `app_metadata` claims:

- `hey_role: "teacher"`
- `hey_account_scope: <the artifact metadata accountScope>`
- `hey_class_ids: [<the artifact metadata classId>, ...]`

Assessment creation and save also bind an explicit class ID to the active class context. HEY denies an answer key when the role, account, class, or authenticated user is missing or mismatched. A student may read a worksheet only with matching account and class claims; only a teacher may save or export it. Client-supplied context can narrow the check, but cannot establish identity or grant a role. The complete lesson journey builds all artifacts before saving its teacher lesson, teacher answer key, and student worksheet. Teacher artifact saves request a Forge write confirmation and verify the returned artifact ID, workspace, account scope, and class; without that confirmation the local in-memory record is discarded and save fails.

## Enforcement gap

This repository has no server-side claim provisioner or verified class-membership source, and no reviewed Supabase Row Level Security policy for `hey_artifacts` or `hey_artifact_versions`. The contract therefore fails closed until an administrator or trusted server provisions the claims. The write confirmation proves that Forge acknowledged and returned the scoped row; it is not a live production durability check. HEY protects reads and exports through its application API only. A user who can query Supabase tables directly may bypass this application check unless database RLS independently denies unauthorized rows. That database enforcement is not implemented or verified here.
