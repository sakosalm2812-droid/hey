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

Reproduce with `node scripts/benchmark-ultrasparse-router.mjs`. The harness builds deterministic synthetic catalogs with eight terms per expert, including shared duplicate terms and suffix-near terms. At every expert count it measures six query classes: sparse pair, skewed relevance, repeated/shared terms, near-duplicate terms, no-match, and hostile input crossing the 4,096-character boundary. Catalog construction and candidate-index preparation are timed and reported separately; both are excluded from selection latency. Call `prepareIndexed()` as the explicit prewarm operation before latency-sensitive use; it is idempotent (`true` when it builds the index, `false` when already prepared) and bounded by the selector's 10,000-expert and 250,000-term catalog limits. Otherwise, the first indexed selection pays setup cost. Query/catalog hashes use SHA-256 over UTF-8 `JSON.stringify(value)`. Every warm-up and timed result is compared with the linear result after timing.

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

## Cold first-selection measurement

The scaling report now also measures the first `select()` call on a fresh selector for each workload case and trial. Selector/catalog construction is outside that timer; lazy index construction is inside it for catalogs using the indexed adaptive strategy. Each result is compared with the linear selector after timing, including the hostile-boundary query. The report labels these as individual observed latencies and per-trial maxima, not p95 estimates, because there is one first-call sample per case per trial. Warmed selection and index preparation remain reported separately.

The first full run with this measurement kept the workload fingerprint unchanged (`80a5cb5f9ce90c0b547220e0a3450abc8014ba2f7f8e0936b9fc509a1cdf024e`) and passed exact parity for 60,000 calls each of the linear, indexed and masked fixed selectors. The adaptive warm-path p95 ranges by catalog size were 241.6–245.0 μs (5), 218.0–223.1 μs (20), 221.1–227.1 μs (100), 639.8–675.9 μs (500), and 2,683.7–2,850.9 μs (2,000). Maximum observed first-selection latency across the six cases, per trial, was 275.9/267.4/84.4 μs (5), 64,492.9/12,040.3/1,385.1 μs (20), 3,763.5/753.7/2,826.1 μs (100), 81,737/6,532.3/49,104.5 μs (500), and 18,841.4/20,591.8/19,781.5 μs (2,000). The large spread is unexplained because host load is not recorded; treat it as observed evidence, not a stable estimate. The full run retained `subMillisecondTargetVerified: false`. Runtime was Node v24.21.0 on Windows x64 with an Intel Core i7-1185G7. This measurement makes lazy setup visible but does not establish a cold-start p95 or justify production integration.

## High-fanout candidate materialization optimization

The `ed6bafc` baseline exposed a repeatable hot case: at 2,000 synthetic experts, the `duplicateTerms` adaptive p95 trials were 2,588.6/2,896.3/2,706.9 μs, and the indexed candidate path's `duplicateTerms` p95 was 4,519 μs. Every matching candidate was accumulated into a `Map`, given a matched-term array, and included in a full sort even though only up to three experts can be returned.

The indexed path now uses a reusable `Uint32Array` score mask plus a touched-index list, resets only touched entries after each call, keeps only the requested top candidates during scoring, and materializes matched terms only for those winners. Ranking stays score-descending with the same lexical ID tie-break. The canonical linear path is unchanged. A dedicated 2,000-expert test checks exact output equality for shared-term ties, a higher-scoring expert, a no-match query after high fanout, and a truncated hostile query.

Two full reruns used the same workload/catalog/query fingerprints and passed exact output parity for 60,000 calls each of linear, indexed and masked selectors. The report marked the **warmed in-process selection** sub-millisecond target verified in both runs. Adaptive p95 μs by trial were:

| Experts | Run 1 | Run 2 | Indexed duplicate-term p95, run 1 / run 2 |
|---:|---:|---:|---:|
| 5 | 226.9 / 221.1 / 230.1 | 224.6 / 228.7 / 234.8 | 47.1 / 34.7 |
| 20 | 218.8 / 216.0 / 210.8 | 210.9 / 206.9 / 211.0 | 85.8 / 36.8 |
| 100 | 222.0 / 221.5 / 217.7 | 222.8 / 220.3 / 221.8 | 82.7 / 73.5 |
| 500 | 233.2 / 232.7 / 226.5 | 234.7 / 230.2 / 230.8 | 214.0 / 178.9 |
| 2,000 | 445.6 / 436.5 / 441.0 | 440.6 / 435.1 / 435.1 | 638.4 / 523.9 |

For comparison, the baseline's 2,000-expert linear `duplicateTerms` p95 was 17,324.4 μs. The optimized indexed case was 638.4 μs and 523.9 μs in the two runs (about 96–97% below that linear reference). These figures apply to the synthetic workload and warmed selection only; they do not validate routing quality or inference. Cold first selection still includes index preparation: separately timed index preparation at 2,000 experts was 11,307.6 and 12,022.4 μs, while the maximum observed first-selection latency across six cases reached 31,538 and 30,354.6 μs. Cold values are single observations per case/trial, not p95, and host CPU load remains unmeasured.

After moving scratch-buffer allocation into lazy index preparation so linear-only selectors do not allocate it, a final full run again passed parity for 60,000 calls per fixed selector and marked the warmed selector target verified. The 2,000-expert adaptive p95 was 441.3/404.2/437.0 μs by trial; the duplicate-term case was 507.9 μs p95 versus 12,381.1 μs for the linear reference. Index preparation was 8,502.7 μs, and the largest observed fresh-selector first-call sample was 20,356.3 μs. For this final run, all catalog sizes also remained under 1 ms adaptive p95 in every trial: 5 experts 231.0/228.0/221.5 μs, 20 experts 207.2/203.4/210.1 μs, 100 experts 205.3/213.4/206.2 μs, and 500 experts 224.0/221.5/212.7 μs. This final sample is consistent with the two prior warmed runs; cold setup remains outside the sub-millisecond result.

## Compact postings and explicit prewarm lifecycle

The bounded `prepareIndexed()` method is the explicit prewarm API: the first call builds the index and returns `true`; subsequent calls return `false`. Its work is bounded by catalog validation (at most 10,000 experts and 250,000 terms). Tests now explicitly cover the unprepared → prepared → reused lifecycle and check output against the linear path across repeated, hostile and no-match queries.

To reduce preparation work, the inverted index now stores each posting as one bounded integer encoding of expert index and term position, rather than allocating an object for every term. The 10,000-expert and 31-terms-per-expert limits keep the encoding within range. Decoding reconstructs the same bit mask, and exact result parity is checked after timing.

Three full runs on the same fingerprint (`80a5cb5f9ce90c0b547220e0a3450abc8014ba2f7f8e0936b9fc509a1cdf024e`) each verified exact output for 60,000 calls per fixed selector and retained the warmed sub-millisecond result. At 2,000 experts, indexed preparation was 6,359.4 μs on the current baseline and 4,690.8/5,227.3 μs with compact postings (about 18–26% lower in these observations). The two compact-posting runs measured overall adaptive p95 at 212.1–243.1 μs and 208.3–247.7 μs across trials; duplicate-term indexed p95 was 402.3 and 383.3 μs. First-selection maxima still varied: 50,795.1 μs on baseline and 14,456.6/35,317.1 μs after compact postings. Those are maxima of single observations per case/trial, not cold p95. Preparation and first selection remain above 1 ms; only warmed in-process selection meets the measured target. Host CPU load remains unrecorded.

The packed-posting guard also exercises the accepted catalog boundary: 10,000 experts, maximum expert index 9,999, and term index 30 on that final expert, with exact equality to the linear oracle and expected routing to `expert-09999`. The benchmark reports the highest synthetic posting value and confirms it fits uint32 for each catalog size. A full run at coordinator `ff04069` retained the workload hash above and exact parity for 60,000 calls per fixed selector. Its maximum synthetic packed posting was 63,975 at 2,000 experts. The target flag was false in that run because the 2,000-expert shared-term adaptive p95 reached 1,353.5 μs in one trial; other trials for that case were 790.7 and 656.7 μs. Preparation measured 47,785.5 μs and first-call maxima were 16,920.9–23,380.6 μs at 2,000 experts, showing substantial host variability. These setup and first-call figures are reported separately from warmed p95 and are not presented as stable latency estimates.

## Catalog term-budget early stop

Catalog creation now tracks the cumulative term count while validating and copying experts, and rejects immediately after the first expert that exceeds the 250,000-term budget. This avoids deep-reading and copying the rest of an oversized catalog before rejection. A deterministic test supplies 10,000 experts with 31 terms each through counted term-array proxies; creation rejects after inspecting 8,065 term arrays, rather than traversing all 10,000. The test also verifies the existing linear-oracle, packed-index-boundary, and selector-reuse cases still pass.

The same fingerprint benchmark ran on the early-stop implementation and retained exact parity for 60,000 calls per fixed selector. Setup, first selection and warmed routing remain separate. One full run measured:

| Experts | Catalog construction μs | Index preparation μs | Warm adaptive p95 by trial μs | Cold first-selection maximum by trial μs |
|---:|---:|---:|---:|---:|
| 5 | 1,403.4 | 249.7 | 116.7 / 108.6 / 124.8 | 113 / 73,026.6 / 121.9 |
| 20 | 431.4 | 229.8 | 103.5 / 103.3 / 102.5 | 33,497.7 / 429.8 / 306.9 |
| 100 | 32,392.9 | 8,184.5 | 108 / 103.1 / 104.3 | 6,911.5 / 421.5 / 3,795.4 |
| 500 | 8,514 | 1,535.6 | 111.2 / 107.9 / 110.8 | 12,522.5 / 5,715.5 / 4,633 |
| 2,000 | 115,948.9 | 4,729.6 | 225.7 / 215 / 236.9 | 17,584.3 / 17,855.5 / 16,308.3 |

The benchmark marked warmed selection below 1 ms in that run. The large catalog-construction and cold-call outliers are unexplained because host load is not recorded. Cold maxima are individual observations across six cases per trial, not cold p95. No inference or end-to-end claim follows from these measurements.

## Vocabulary character budget

The catalog now has a cumulative vocabulary limit of 4,000,000 ASCII characters in addition to its expert and term-count caps. `readCatalogExpert` totals term lengths before regex validation and rejects a single expert over the same cap; catalog creation accumulates the validated lengths and stops after the first expert that exceeds the total. This bounds retained term text and limits regex work on accepted or rejected catalogs. Tests cover two individually valid 31-term experts whose combined vocabulary exceeds the cap, plus a single token longer than the cap.

The full benchmark reports `catalogTermCharacters` and the configured limit alongside catalog construction, index preparation, first selection and warmed p95. On workload `80a5cb5f9ce90c0b547220e0a3450abc8014ba2f7f8e0936b9fc509a1cdf024e`, exact parity passed for 60,000 calls each of linear, indexed and masked selectors, and the warmed sub-millisecond flag was true. Across 5/20/100/500/2,000 experts the generated catalog term characters were 300/1,260/6,540/35,340/149,340. At 2,000 experts, construction measured 22,591.8 μs, index preparation 50,734.3 μs, warmed p95 by trial 206.3/211.4/200.3 μs, and first-selection maxima 34,068.6/11,649.8/9,769.9 μs. The setup and cold tails varied substantially and are not p95 performance claims; host load is not recorded. No inference or end-to-end performance is measured.
