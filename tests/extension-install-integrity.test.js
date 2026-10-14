import assert from "node:assert/strict";
import test from "node:test";
import { webcrypto } from "node:crypto";

import { DeveloperEngine } from "../src/core/developerEngine.js";
import { packageSigningPayload } from "../src/core/packageValidation.js";

const memoryStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
};

const basePackage = {
  name: "signed-extension",
  version: "1.2.3",
  manifest: {
    name: "signed-extension",
    version: "1.2.3",
    capabilities: ["notes.read"],
  },
  dependencies: [],
  licenses: ["MIT"],
  compatibility: [],
};

async function createEngineWithInstalledPackage() {
  const keyPair = await webcrypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const publicKey = new Uint8Array(await webcrypto.subtle.exportKey("raw", keyPair.publicKey));
  const toBase64 = (value) => Buffer.from(value).toString("base64");
  const engine = new DeveloperEngine({
    trustedKeys: { release: toBase64(publicKey) },
    storage: memoryStorage(),
  });
  const unsigned = { ...basePackage, description: "", schemaId: null };
  const signature = await webcrypto.subtle.sign(
    { name: "Ed25519" },
    keyPair.privateKey,
    new TextEncoder().encode(packageSigningPayload(unsigned)),
  );
  const pkg = engine.createPackage({
    ...basePackage,
    signature: { algorithm: "Ed25519", keyId: "release", value: toBase64(signature) },
  });

  assert.equal((await engine.validatePackage(pkg.id)).valid, true);
  assert.equal((await engine.stagePackage(pkg.id)).state, "staged");
  assert.equal((await engine.installPackage(pkg.id)).state, "installed");
  return { engine, pkg };
}

test("an unlinked extension cannot bypass the signed package installation gate", async () => {
  const engine = new DeveloperEngine({ storage: memoryStorage() });
  const extension = engine.registerExtension({
    name: "untrusted",
    version: "1.0.0",
    manifest: { name: "untrusted", version: "1.0.0" },
  });
  extension.state = "installed";
  engine.getAllExtensions()[0].state = "installed";

  assert.equal(engine.getExtension(extension.id).state, "staged");

  const result = await engine.installExtension(extension.id);

  assert.match(result.error, /installed signed package/i);
  assert.equal(engine.getExtension(extension.id).state, "staged");
});

test("extension install requires a trusted installed package and matching capability manifest", async () => {
  const { engine, pkg } = await createEngineWithInstalledPackage();
  const extension = engine.registerExtension({
    packageId: pkg.id,
    name: pkg.name,
    version: pkg.version,
    manifest: pkg.manifest,
    capabilities: [...pkg.manifest.capabilities, "account.admin"],
    dependencies: pkg.dependencies,
    licenses: pkg.licenses,
  });

  const blocked = await engine.installExtension(extension.id);

  assert.match(blocked.error, /signature or declared capabilities are invalid/i);
  assert.equal(engine.getExtension(extension.id).state, "staged");

  const validExtension = engine.registerExtension({
    packageId: pkg.id,
    name: pkg.name,
    version: pkg.version,
    manifest: pkg.manifest,
    capabilities: pkg.manifest.capabilities,
    dependencies: pkg.dependencies,
    licenses: pkg.licenses,
  });

  const installed = await engine.installExtension(validExtension.id);
  assert.equal(installed.state, "installed");
});

test("tampering with an installed package invalidates extension installation", async () => {
  const { engine, pkg } = await createEngineWithInstalledPackage();
  const extension = engine.registerExtension({
    packageId: pkg.id,
    name: pkg.name,
    version: pkg.version,
    manifest: pkg.manifest,
    capabilities: pkg.manifest.capabilities,
    dependencies: pkg.dependencies,
    licenses: pkg.licenses,
  });
  pkg.manifest.capabilities.push("billing.admin");

  const result = await engine.installExtension(extension.id);

  assert.match(result.error, /signature or declared capabilities are invalid/i);
  assert.equal(engine.getExtension(extension.id).state, "staged");
});

test("malformed cyclic extension metadata fails closed without escaping", async () => {
  const { engine, pkg } = await createEngineWithInstalledPackage();
  const extension = engine.registerExtension({
    packageId: pkg.id,
    name: pkg.name,
    version: pkg.version,
    manifest: pkg.manifest,
    capabilities: pkg.manifest.capabilities,
    dependencies: pkg.dependencies,
    licenses: pkg.licenses,
  });
  const cyclicManifest = { name: pkg.name, version: pkg.version };
  cyclicManifest.self = cyclicManifest;
  engine.extensions.get(extension.id).manifest = cyclicManifest;

  const result = await engine.installExtension(extension.id);

  assert.match(result.error, /signature or declared capabilities are invalid/i);
  assert.equal(engine.getExtension(extension.id).state, "staged");
});
