# HEY-ONE model and inference contracts

This slice adds provenance and request contracts to the existing provider registry/router. It does not contain weights, train an adapter, start a serving process, or claim a selected production model.

## Candidate research (15 October 2026)

| Candidate | License evidence | Hardware evidence | HEY status |
| --- | --- | --- | --- |
| Qwen/Qwen3-4B | The publisher model card declares Apache-2.0 and links the license. [Model card](https://huggingface.co/Qwen/Qwen3-4B) · [license](https://huggingface.co/Qwen/Qwen3-4B/blob/main/LICENSE) | 4B parameters imply about 8 GB decimal for bf16 weights alone. Runtime, KV cache, context, and allocator overhead add memory. This is arithmetic, not tested hardware minimum. | Candidate only. |
| Mistral-Small-3.1-24B-Instruct-2503 | The publisher model card declares Apache-2.0. [Model card](https://huggingface.co/mistralai/Mistral-Small-3.1-24B-Instruct-2503) · [license](https://huggingface.co/mistralai/Mistral-Small-3.1-24B-Instruct-2503/blob/main/LICENSE) | Publisher reports approximately 55 GB GPU RAM for bf16/fp16 and quantized use on a 32 GB MacBook. Treat as publisher guidance; HEY has not reproduced it. | Candidate only; this class requires a separate host or paid GPU capacity and is not a laptop prerequisite. |

No winner is selected: HEY has not run its task-quality, latency, privacy, and cost suite against these candidates on an intended serving host. Model records require an immutable model revision, content hashes, runtime compatibility, evaluation suite/dataset revision, run ID, hardware identity, and measured p95 latency before routing can use quality/latency evidence. A mutable `main` pointer in candidate research is a discovery link only; deployment must pin a commit and re-check the license.

## Adapter provenance and portability

`createAdapterManifest` describes a PEFT LoRA or QLoRA artifact using hashes for the adapter, config, dataset manifest, and a pinned base model; it records training-code revision, dataset-license review, framework/version, evaluation run, quantization configuration, serialization format, protocol, and supported runtimes. This follows PEFT's checkpoint contract, which pairs adapter weights with `adapter_config.json`. [PEFT checkpoint format](https://huggingface.co/docs/peft/en/developer_guides/checkpoint)

This is a validation/metadata seam only. It does not execute training or verify that a declared artifact hash matches a downloaded artifact. PEFT/Transformers/vLLM can be used as development software; obtaining GPU compute for training or hosted inference can still incur provider charges. HEY has not downloaded large weights or required the user's laptop to run them.

## Profiles and routing

`Fast`, `Balanced`, and `Maximum Quality` map to explicit p95 latency limits, a floor on the normalized pass rate, token estimates, a request-cost ceiling, and a 30-day maximum evaluation age. These are initial HEY policy guardrails, not benchmark results or guarantees. Profiled selection derives access from owner-bound `permissionManager` grants for `provider.remote` or `provider.local` plus `provider:<id>`, requires the provider/model to still match the enabled registry, and accepts only routing evidence attached from a verified report for that exact pinned model. The optional `allowedProviders` list (at most 100 canonical IDs) and existing caller permission list can narrow this result but cannot add access. Plans carry a private-bound account/permission revision snapshot; local provider dispatch rechecks that snapshot before and after awaits, stopping when the account changes or a grant is revoked. Edge Fusion uses its authenticated server entitlements and revalidates them around provider calls. Missing, mismatched, unregistered, denied, or stale evidence fails closed. `budgetUsd` can tighten each profile. Fallback candidates pass the same grant, provenance, freshness, profile, privacy, and budget gates. Local-only/no-cloud routing excludes models unless their registry entry explicitly says `local: true`.

This local permission contract does not replace server-side provider entitlement or credential checks. No provider was called by these tests.

## Edge provider discovery and chat routing

The authenticated Edge `GET /models` response lists only provider/model pairs with a server-held API key and a matching entry in `HEY_CHAT_PRICING_JSON`. It returns provider IDs, exact model IDs, the per-model request cap, and a `configured` state; that state confirms configuration, not a live provider health check. API keys and vendor error bodies never go to the browser. Chat can send Automatic or one exact pair from this catalog. The Edge handler resolves the selection against its current server configuration and does not silently switch to another model when an explicitly selected model is missing or fails.

Normal chat needs the provider API key, optional provider model environment variable, and a verified per-model price record. `HEY_CHAT_PRICING_JSON` sets an overall request budget of at most USD 0.25 and each provider's per-request cap, with input/output prices per million tokens. The Edge handler caps estimated input at 32,000 tokens, reserves the input estimate, limits output tokens to the remaining cap, allows at most 1,200 output tokens per provider and 18 seconds per provider attempt within a 35-second request deadline, and requires bounded usage reporting before delivering the answer. Automatic routing can fall back to another configured and priced provider while keeping the aggregate reservation within the request budget. Fusion remains an explicit opt-in and uses its separate `HEY_FUSION_PRICING_JSON` two-provider budget, authenticated entitlement checks, and cancellation boundary.

The provider list is discovered in the signed-in browser session, and selected provider/model IDs are sent with the chat request. The Edge route rechecks the exact pair against server configuration, carries request cancellation into the provider fetch, and returns the provider, model, and measured cost in response metadata. The current workspace has no provider API keys, chat prices, Supabase endpoint, or deployment token, so live availability and real inference remain unverified; mock-provider tests are not evidence of live access.

`createInferenceRequest` creates a provider-neutral OpenAI-compatible message envelope, binds the selected profile, budget and privacy mode, and rejects an incompatible model before dispatch. A real serving adapter still needs to enforce this metadata server-side; a browser request contract is not a privacy boundary or a billing authorization.

## Reproducible verification

`HEY.modelPlatform.createEvaluationReport` summarizes at most 1,000 caller-supplied evaluation cases. It derives pass-rate quality, nearest-rank p50/p95/p99 latency, token totals, and cost from explicit per-million-token prices. A canonical SHA-256 measurement digest binds the measured per-case verdict/latency/token tuples without storing case IDs or content; a second report digest binds that digest and the pinned model revision/weight hash, dataset hash, suite, hardware/runtime/version, run ID, pricing, aggregate measurements, and canonical timestamp. `verifyEvaluationReport` detects edits that do not also replace the digest. `HEY.providers.attachEvaluationReport` accepts only a verified report whose model id, revision, and weight digest match the registered model, then derives that model's routing evidence from the report.

These are unkeyed digests over caller-supplied observations. A caller can create a different report and compute a new digest; the digest proves neither measurement origin nor authenticity. The function does not execute a model, validate labels, or verify that a declared weight hash matches a file. Reports remain reproducible metadata, not independently verified benchmark evidence.

The deterministic tests use fixture measurements and fake providers. They cover metadata/hash rejection, adapter manifest completeness, profile gates, fallback, cost-budget exhaustion, local-only selection, inference-request privacy rejection, and aggregation bounds/hostile inputs. No LLM was run and no quality/latency result was measured for a real model.
