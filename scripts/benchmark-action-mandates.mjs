import { webcrypto } from "node:crypto";
import { InMemoryMandateStore, issueActionMandate, verifyAndConsumeMandate } from "../src/core/actionMandate.js";

const iterations = Number(process.env.MANDATE_BENCH_ITERATIONS || 1000);
if (!Number.isSafeInteger(iterations) || iterations < 1 || iterations > 100_000) throw new RangeError("MANDATE_BENCH_ITERATIONS must be between 1 and 100000.");
const pair = await webcrypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
const now = Date.now();
const mandate = await issueActionMandate({ accountId: "benchmark", actions: ["web.search"], resources: ["web.search"], expiresAt: new Date(now + 60_000).toISOString(), maxUses: iterations }, { privateKey: pair.privateKey, keyId: "benchmark", now });
const store = new InMemoryMandateStore();
const trustedKeys = { benchmark: pair.publicKey };
const durations = [];
let rejected = 0;
for (let index = 0; index < iterations; index += 1) {
  const started = performance.now();
  const result = await verifyAndConsumeMandate(mandate, {
    accountId: "benchmark", action: "web.search", resource: "web.search", idempotencyKey: `bench-${index}`, currentRevocationEpoch: 0,
  }, { trustedKeys, store, now });
  durations.push(performance.now() - started);
  if (!result.authorized) rejected += 1;
}
durations.sort((a, b) => a - b);
const percentile = (p) => durations[Math.min(durations.length - 1, Math.ceil(p * durations.length) - 1)];
console.log(JSON.stringify({ iterations, authorized: iterations - rejected, rejected, p50Ms: percentile(0.5), p95Ms: percentile(0.95), operationsPerSecond: Math.round(1000 / (durations.reduce((sum, value) => sum + value, 0) / iterations)), store: "in-memory transactional test adapter", productionStoreVerified: false }, null, 2));
