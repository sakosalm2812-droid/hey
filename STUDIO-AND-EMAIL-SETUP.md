# HEY Studio and email setup

The project remains at `E:\hey`. The interface changes are local source changes. Deploying the website, functions, database migration, and hosted email templates are separate operations.

## Connect real AI replies

In your existing Supabase project's **Edge Functions → Secrets**, add a funded provider key. Never prefix a secret with `VITE_` or put it in frontend code.

| Secret | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | OpenAI chat, vision, and image generation |
| `OPENAI_MODEL` | Chat model; defaults to `gpt-4.1` |
| `OPENAI_IMAGE_MODEL` | Image model; defaults to `gpt-image-1.5` |
| `OPENAI_VISION_MODEL` | Vision model; defaults to `gpt-4.1` |
| `LUMA_API_KEY` | Luma Dream Machine video generation |
| `LUMA_VIDEO_MODEL` | Dream Machine model; defaults to `ray-2` |
| `APP_URL` | Exact website origin, including scheme and local port when developing |

Chat also retains OpenRouter, Gemini, and Groq support using the existing provider secrets. `HEY_PROVIDER` can select the preferred provider. The image and chat models are configurable; defaults are integration choices, not claims that they are the latest models or available on every account. The Luma adapter uses the documented Dream Machine API, not the newer Luma Agents API; use a compatible key.

Public `.env.local` needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Optional `VITE_HEY_API_URL` and `VITE_HEY_STUDIO_URL` can override function URLs. Use a current browser with AbortSignal timeout support.

After authenticating the Supabase CLI and linking the correct project, review pending migrations, apply them, and deploy `hey` and `hey-studio`. The new migration is `supabase/migrations/20260913223000_studio.sql`. It creates an owner-readable job history, a private image bucket, and a service-only quota reservation function. Do not apply unrelated pending migrations without checking the other task's work.

Studio limits new creation requests to 3/day for Free, 10/day for Pro, and 25/day for Elite; videos require Pro or Elite. Limits are checked in PostgreSQL, including concurrent requests. Failed attempts count because a provider may have accepted or billed a request before timing out. The day boundary follows the database timezone (normally UTC). Set provider billing caps as well. These are application defaults that can be changed in the migration before deployment.

Images are generated as PNGs and saved privately. Signed image links last one hour; reopen a creation to refresh its link. Videos are 5 seconds at 720p, and completion is polled on demand from Studio. A provider-hosted video URL may expire; save the finished video. Image generation interrupted before storage may require checking provider usage. Music and downloadable audio generation are not connected; unsupported requests explicitly say so. Browser voice conversations retain their separate speech integration.

## Make outgoing emails say “Hey”

1. Open the correct project in the Supabase Dashboard, then **Authentication → Email → SMTP Settings** (the dashboard may label this Custom SMTP).
2. Configure your SMTP provider's host, port, username, password, and verified sender email address.
3. Set **Sender name** to **Hey**. The sender address must be one you own and have verified; the display name alone does not change the email address.
4. Open **Authentication → Email Templates**. Copy the corresponding HTML from `supabase/templates/` into Confirmation, Recovery, Magic Link, Invite, Email Change, and Reauthentication. Use the subjects in `supabase/config.toml`.
5. Configure your production Site URL and permitted redirect URLs. Test confirmation, sign-in, password reset, and email change with an account you control.

The local `sender_name = "Hey"` and template entries do **not** update an existing hosted project automatically. Custom SMTP remains disabled in the local config until you configure it.

## Replace the wordmark with your logo

Each email template marks its wordmark with an HTML comment. Replace that `div` with an image pointing to your publicly hosted HTTPS PNG logo, for example:

```html
<img src="https://YOUR-DOMAIN/logo-email.png" width="96" alt="Hey" style="display:block;border:0;height:auto">
```

Replace the example URL before use. Keep a text alternative, use PNG for broad email compatibility, and preview in light/dark email clients. The application wordmarks can be replaced separately when the actual logo is supplied.

## Verify before announcing release

Run `npm test`, `npm run lint`, `npm run build`, and `cargo check --manifest-path src-tauri/Cargo.toml` from `E:\hey`. Check both Edge Functions with Deno. Then test a real signed-in chat, image request, video request, another account's inability to read a creation, quota behavior, and email delivery. Fixture-based UI checks do not establish live provider or database availability.

Art direction and continuity instructions improve the generation request. They do not train the provider's underlying model. To measure quality changes, compare fixed briefs and score prompt fidelity, composition, text accuracy, temporal stability, and usable output rate before and after.

Official references: [Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [email templates](https://supabase.com/docs/guides/local-development/customizing-email-templates), [OpenAI image generation](https://developers.openai.com/api/docs/guides/image-generation), [GPT-4.1](https://developers.openai.com/api/docs/models/gpt-4.1), [Luma Dream Machine video generation](https://docs.lumalabs.ai/docs/video-generation).
