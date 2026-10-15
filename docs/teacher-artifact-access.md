# Teacher answer-key access contract

HEY identifies an answer key from `content` fields named `teacherAnswer`. The `audience`, workflow, and other artifact metadata do not grant access. The canonical HEY artifact read, list, version, history, comparison, and answer-key export paths require `supabaseClient.auth.getUser()` to return an authenticated user with server-managed `app_metadata` claims:

- `hey_role: "teacher"`
- `hey_account_scope: <the artifact metadata accountScope>`
- `hey_class_ids: [<the artifact metadata classId>, ...]`

Assessment creation and save also bind an explicit class ID to the active class context. HEY denies an answer key when the role, account, class, or authenticated user is missing or mismatched. Client-supplied context can narrow the check, but cannot establish identity or grant a role.

## Enforcement gap

This repository has no server-side claim provisioner or verified class-membership source, and no reviewed Supabase Row Level Security policy for `hey_artifacts` or `hey_artifact_versions`. The contract therefore fails closed until an administrator or trusted server provisions the claims. It protects reads and exports through the HEY application API only. A user who can query Supabase tables directly may bypass this application check unless database RLS independently denies unauthorized rows. That database enforcement is not implemented or verified here.
