# Ultrasparse selector research

## Experimental representation

The experimental masked selector dispatches unique query tokens through a prebuilt token-to-expert index and accumulates matched term bits in a fixed array. It avoids allocating per-query expert maps and matched-term sets used by the existing indexed implementation. It emits the same ranked experts and ordered matched terms as the linear selector. The linear selector remains the default.

The current five experts each have fewer than 31 terms. If a future vocabulary exceeds the 31-term mask capacity, the experimental selector falls back to the linear implementation rather than dropping matches. The selector only chooses lexical labels; it does not load experts or perform inference.

## Reproduce the local microbenchmark

From the repository root, run:

```powershell
node scripts/benchmark-ultrasparse-router.mjs
```

The benchmark uses six fixed queries (303 UTF-8 bytes total; SHA-256 `80a5cb5f9ce90c0b547220e0a3450abc8014ba2f7f8e0936b9fc509a1cdf024e`), 2,000 warm-up calls per algorithm per trial, five trials, and 10,000 timed calls per algorithm per trial. Its versioned workload fingerprint is SHA-256 over the UTF-8 bytes of `JSON.stringify(queryArray)` and reports the canonicalization, query count and byte count. The JSON report also separates Node/V8, OS platform/release/architecture, and CPU model/count/total memory fields. Measurements cover synchronous lexical selection only: model loading, network, prefill, decode and inference are excluded. The report explicitly marks the sub-millisecond end-to-end target as unverified. The reported latency samples are selection-only, with 50,000 operations per algorithm. Each warm-up and timed result is compared field-by-field with the linear selector's output after the timed interval; any mismatch stops the run without a report. This consumes measured results and guards the benchmark against silently timing divergent output. Algorithm call order rotates; empty timer-pair samples are reported separately without subtraction. The process RSS delta is a whole-process before/after snapshot, not attributable to any selector.

Observed on Windows x64, Node v24.21.0, 11th Gen Intel Core i7-1185G7 @ 3.00 GHz, 8 logical CPUs, 16,888,762,368 bytes total RAM:

| Run | Selector | p50 μs | p95 μs | p99 μs | Samples |
|---|---|---:|---:|---:|---:|
| 1 | Linear (default) | 5.1 | 9.6 | 14.3 | 50,000 |
| 1 | Inverted index | 3.5 | 7.0 | 12.2 | 50,000 |
| 1 | Masked index | 2.1 | 4.3 | 7.6 | 50,000 |
| 2 | Linear (default) | 5.1 | 10.0 | 13.9 | 50,000 |
| 2 | Inverted index | 3.5 | 7.4 | 11.8 | 50,000 |
| 2 | Masked index | 2.1 | 4.6 | 7.4 | 50,000 |

Timer-pair p50/p95/p99 was 0.1/0.1/0.1 μs in both runs. Whole-process RSS was 44,847,104 → 61,747,200 bytes in run 1 and 44,793,856 → 61,431,808 bytes in run 2. These RSS snapshots include the benchmark and runtime and are not per-algorithm allocation measurements.

After adding per-call output-equivalence checks on 2026-10-15, two rechecks on the same host reported these p50/p95/p99 μs values (50,000 timed calls and 60,000 checked calls per algorithm each run):

| Recheck | Selector | p50 μs | p95 μs | p99 μs |
|---|---|---:|---:|---:|
| 1 | Linear (default) | 31.0 | 49.9 | 321.2 |
| 1 | Inverted index | 20.5 | 41.2 | 254.0 |
| 1 | Masked index | 12.0 | 22.1 | 114.2 |
| 2 | Linear (default) | 31.1 | 67.4 | 539.6 |
| 2 | Inverted index | 20.6 | 52.9 | 459.9 |
| 2 | Masked index | 12.1 | 26.9 | 211.4 |

The rechecks had visibly variable tails; treat them as local observations, not stable service-level performance. Output validation runs after each timed interval and can still affect later samples through host scheduling and runtime state.

## Expert-count scaling experiment

Reproduce with `node scripts/benchmark-ultrasparse-router.mjs`. The harness builds deterministic synthetic catalogs with eight terms per expert, including shared duplicate terms and suffix-near terms. At every expert count it measures six query classes: sparse pair, skewed relevance, repeated/shared terms, near-duplicate terms, no-match, and hostile input crossing the 4,096-character boundary. Catalog construction and candidate-index preparation are timed and reported separately; both are excluded from selection latency. Call `prepareIndexed()` before latency-sensitive use; otherwise the first indexed selection pays setup cost. Query/catalog hashes use SHA-256 over UTF-8 `JSON.stringify(value)`. Every warm-up and timed result is compared with the linear result after timing.

Observed on Windows 10.0.26200 x64, Node v24.21.0 / V8 13.6.233.17-node.53, Intel Core i7-1185G7, 8 logical CPUs, one full invocation. Each case/selector had 1,500 samples at 5–100 experts, 750 at 500 experts, and 300 at 2,000 experts; each had three trials. Values are linear p50/p95 μs / indexed-candidate p50/p95 μs:

| Experts | Case | Linear p50/p95 μs | Indexed candidates p50/p95 μs |
|---:|---|---:|---:|
| 5 | Sparse pair | 35.4 / 56.1 | 16.5 / 35.1 |
| 5 | Skewed relevance | 32.2 / 44.7 | 12.7 / 20.3 |
| 5 | Duplicate terms | 36.7 / 56.8 | 14.3 / 26.1 |
| 5 | Near-duplicate terms | 26.8 / 34.5 | 8.3 / 12.1 |
| 5 | No match | 20.6 / 25.1 | 4.5 / 6.5 |
| 5 | Hostile boundary | 229.0 / 468.3 | 209.4 / 430.6 |
| 20 | Sparse pair | 88.9 / 124.3 | 16.1 / 34.6 |
| 20 | Skewed relevance | 85.5 / 123.3 | 12.3 / 18.5 |
| 20 | Duplicate terms | 120.2 / 194.3 | 27.9 / 43.5 |
| 20 | Near-duplicate terms | 78.6 / 111.0 | 8.2 / 13.8 |
| 20 | No match | 68.7 / 122.5 | 4.4 / 7.2 |
| 20 | Hostile boundary | 282.8 / 580.5 | 209.3 / 348.3 |
| 100 | Sparse pair | 383.7 / 852.5 | 16.5 / 39.0 |
| 100 | Skewed relevance | 385.8 / 1,020.0 | 13.1 / 31.4 |
| 100 | Duplicate terms | 600.1 / 1,167.3 | 116.4 / 201.8 |
| 100 | Near-duplicate terms | 354.4 / 650.4 | 8.2 / 19.2 |
| 100 | No match | 332.2 / 736.4 | 4.6 / 14.9 |
| 100 | Hostile boundary | 560.8 / 1,191.0 | 212.0 / 355.3 |
| 500 | Sparse pair | 1,917.9 / 5,599.1 | 18.9 / 57.4 |
| 500 | Skewed relevance | 1,883.7 / 3,524.8 | 16.1 / 41.7 |
| 500 | Duplicate terms | 3,092.9 / 8,060.7 | 623.4 / 1,683.9 |
| 500 | Near-duplicate terms | 1,780.8 / 3,726.7 | 9.0 / 31.4 |
| 500 | No match | 1,800.5 / 6,017.9 | 5.2 / 26.8 |
| 500 | Hostile boundary | 1,961.7 / 5,241.2 | 214.9 / 405.5 |
| 2,000 | Sparse pair | 8,088.7 / 17,875.3 | 30.1 / 80.6 |
| 2,000 | Skewed relevance | 7,600.2 / 13,599.6 | 26.4 / 74.5 |
| 2,000 | Duplicate terms | 12,983.5 / 45,361.6 | 2,568.2 / 7,103.1 |
| 2,000 | Near-duplicate terms | 7,283.7 / 14,320.7 | 14.1 / 46.7 |
| 2,000 | No match | 7,400.5 / 12,361.4 | 13.6 / 36.5 |
| 2,000 | Hostile boundary | 7,239.8 / 11,560.4 | 223.1 / 441.1 |

Catalog/index setup (μs) was 4,096.7 at 5 experts, 1,808.9 at 20, 7,775.7 at 100, 31,023.3 at 500, and 92,709.7 at 2,000. The indexed candidate path had lower p50 and p95 than linear across the six cases at 20+ experts, so the measured 20-expert crossover remains. Dense duplicate-term fanout raises candidate p95 to 1,683.9 μs at 500 and 7,103.1 μs at 2,000, though the corresponding linear p95 is much higher. The benchmark therefore reports `subMillisecondTargetVerified: false` for this mixed workload; end-to-end latency remains unverified. Results are one synthetic host invocation and do not establish routing quality or inference performance.

## Limits

This is a small synthetic lexical-selector microbenchmark on one CPU host. It does not establish routing quality, inference speed, model/expert loading cost, network latency, prefill/decode latency, memory use of model weights, energy use, GPU performance, or end-to-end task latency. Results are local observations and should be remeasured on the target runtime and workload before considering a default change.
