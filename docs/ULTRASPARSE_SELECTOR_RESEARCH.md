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

Reproduce with `node scripts/benchmark-ultrasparse-router.mjs`. The harness additionally builds deterministic synthetic catalogs with eight distinct terms per expert and queries that match exactly two experts. It compares a full linear catalog scan with a prebuilt inverted candidate index. Catalog construction and candidate-index preparation are timed and reported separately; both are excluded from per-selection latency. Call `prepareIndexed()` before latency-sensitive use; otherwise the first indexed selection pays that setup cost. The harness estimates the number of selections needed to amortize setup at the observed p50 saving. Each measured output is compared with linear output after stopping the timer. The fixture and queries have independent SHA-256 fingerprints, using UTF-8 bytes of `JSON.stringify(value)` as the versioned canonical form.

Observed on Windows 10.0.26200 x64, Node v24.21.0 / V8 13.6.233.17-node.53, Intel Core i7-1185G7, 8 logical CPUs, one full invocation:

| Experts | Samples/selector | Linear p50/p95 μs | Indexed candidates p50/p95 μs | Catalog construction μs | Index preparation μs | Estimated break-even selections |
|---:|---:|---:|---:|---:|---:|---:|
| 5 | 15,000 | 5.8 / 12.6 | 2.9 / 6.6 | 1,039.9 | 217.1 | 434 |
| 20 | 15,000 | 16.3 / 33.8 | 3.3 / 7.1 | 229.6 | 64.0 | 23 |
| 100 | 15,000 | 75.1 / 160.8 | 3.3 / 8.0 | 2,144.3 | 346.2 | 35 |
| 500 | 3,000 | 349.9 / 687.1 | 3.4 / 10.1 | 5,558.6 | 2,122.4 | 23 |
| 2,000 | 750 | 1,324.3 / 2,380.3 | 4.7 / 15.2 | 13,165.1 | 4,293.2 | 14 |

This measurement shows the full scan cost growing with catalog size while candidate accumulation touches only matching experts. It supports using the indexed candidate path at 20 or more experts when catalogs are expected to be reused enough to amortize setup; smaller catalogs retain the linear path. The 5-expert path estimates 434 selections to amortize index setup at this p50; the 20–2,000 expert paths estimate 14–35 selections. In this full run, the benchmark reported `subMillisecondTargetVerified: true`: every per-trial p95 for the fixed selectors and adaptive synthetic paths was below 1,000 μs (maximum adaptive per-trial p95: 15.8 μs). The linear reference scan alone exceeded 1 ms p95 at 2,000 experts; the verified status applies to the selected adaptive path, not that reference scan. This is only in-process lexical selection for this workload and machine. End-to-end verification remains false; model loading, network, prefill, decode, inference, and application work are excluded. The figures are one host invocation, with visible tail variation in the linear path.

## Limits

This is a small synthetic lexical-selector microbenchmark on one CPU host. It does not establish routing quality, inference speed, model/expert loading cost, network latency, prefill/decode latency, memory use of model weights, energy use, GPU performance, or end-to-end task latency. Results are local observations and should be remeasured on the target runtime and workload before considering a default change.
