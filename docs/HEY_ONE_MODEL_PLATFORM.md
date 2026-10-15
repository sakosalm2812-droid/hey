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

`Fast`, `Balanced`, and `Maximum Quality` map to explicit p95 latency limits, a floor on a normalized HEY evaluation score, a token estimate, and a request-cost ceiling. These are initial HEY policy guardrails, not benchmark results or guarantees. The canonical `providerRouter` applies them only to provider model records with complete routing evidence including `evaluationRunId` and input/output USD-per-million-token prices. Incomplete evidence fails closed for profiled requests. `budgetUsd` can tighten each profile. Fallback candidates are constrained by the same profile, privacy mode, and budget. Local-only/no-cloud routing excludes models unless their registry entry explicitly says `local: true`.

`createInferenceRequest` creates a provider-neutral OpenAI-compatible message envelope, binds the selected profile, budget and privacy mode, and rejects an incompatible model before dispatch. A real serving adapter still needs to enforce this metadata server-side; a browser request contract is not a privacy boundary or a billing authorization.

## Reproducible verification

`HEY.modelPlatform.createEvaluationReport` summarizes at most 1,000 caller-supplied evaluation cases. It derives pass-rate quality, nearest-rank p50/p95/p99 latency, token totals, and cost from explicit per-million-token prices, and binds the summary to model revision/weight hash, suite/dataset revision, hardware label, timestamp, and run ID. It returns no per-case identifiers or content and its evaluation summary can be passed to `createModelRecord`. Inputs are observations supplied by the caller: the function does not execute a model, validate labels, authenticate measurements, or verify that a declared weight hash matches a file. Reports are therefore reproducible metadata, not independently verified benchmark evidence.

The deterministic tests use fixture measurements and fake providers. They cover metadata/hash rejection, adapter manifest completeness, profile gates, fallback, cost-budget exhaustion, local-only selection, inference-request privacy rejection, and aggregation bounds/hostile inputs. No LLM was run and no quality/latency result was measured for a real model.
