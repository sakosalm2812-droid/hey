# Ultrasparse selector research

## Experimental representation

The experimental masked selector dispatches unique query tokens through a prebuilt token-to-expert index and accumulates matched term bits in a fixed array. It avoids allocating per-query expert maps and matched-term sets used by the existing indexed implementation. It emits the same ranked experts and ordered matched terms as the linear selector. The linear selector remains the default.

The current five experts each have fewer than 31 terms. If a future vocabulary exceeds the 31-term mask capacity, the experimental selector falls back to the linear implementation rather than dropping matches. The selector only chooses lexical labels; it does not load experts or perform inference.

## Reproduce the local microbenchmark

From the repository root, run:

```powershell
node scripts/benchmark-ultrasparse-router.mjs
```

The benchmark uses six fixed queries (303 UTF-8 bytes total; SHA-256 `80a5cb5f9ce90c0b547220e0a3450abc8014ba2f7f8e0936b9fc509a1cdf024e`), 2,000 warm-up calls per algorithm per trial, five trials, and 10,000 timed calls per algorithm per trial. The reported latency samples are selection-only, with 50,000 operations per algorithm. Algorithm call order rotates; empty timer-pair samples are reported separately without subtraction. The process RSS delta is a whole-process before/after snapshot, not attributable to any selector.

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

## Limits

This is a small synthetic lexical-selector microbenchmark on one CPU host. It does not establish routing quality, inference speed, model/expert loading cost, network latency, prefill/decode latency, memory use of model weights, energy use, GPU performance, or end-to-end task latency. Results are local observations and should be remeasured on the target runtime and workload before considering a default change.
