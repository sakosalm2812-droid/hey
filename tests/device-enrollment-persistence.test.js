import assert from "node:assert/strict";
import test from "node:test";
import { setAccountScope, getAccountStorageKey } from "../src/core/accountScope.js";
import { clearDeviceRegistry, getDevice, listDevices, registerDevice, revokeDevice, unregisterDevice } from "../src/core/deviceGateway.js";

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

function withStorage(storage, callback) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
  setAccountScope(null);
  clearDeviceRegistry();
  try { return callback(storage); }
  finally {
    clearDeviceRegistry();
    setAccountScope(null);
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else delete globalThis.localStorage;
  }
}

const ownerA = { id: "enrollment-account-a" };
const ownerB = { id: "enrollment-account-b" };
const enrollment = (id) => ({
  id,
  name: "Test device",
  platform: "web",
  status: "offline",
  capabilities: ["test.read"],
  metadata: { label: "persisted" },
});

test("device enrollments recover after reset and remain isolated between account scopes", () => withStorage(new MemoryStorage(), (storage) => {
  setAccountScope(ownerA.id);
  registerDevice(enrollment("persisted-device-a"), { user: ownerA });
  const keyA = getAccountStorageKey("hey_device_enrollments");
  const savedA = storage.getItem(keyA);
  assert.ok(savedA);

  clearDeviceRegistry();
  assert.equal(getDevice("persisted-device-a").accountId, ownerA.id, "a lifecycle reset recovers saved registrations");

  setAccountScope(ownerB.id);
  assert.deepEqual(listDevices(), [], "a different signed-in account sees no prior device record");
  assert.throws(() => registerDevice(enrollment("wrong-owner"), { user: ownerA }), /active owning account/i);
  registerDevice(enrollment("persisted-device-b"), { user: ownerB });
  assert.notEqual(getAccountStorageKey("hey_device_enrollments"), keyA);

  setAccountScope(ownerA.id);
  assert.deepEqual(listDevices().map((device) => device.id), ["persisted-device-a"]);
  assert.equal(storage.getItem(keyA), savedA);
}));

test("revocation and unregister are persisted and survive a registry reload", () => withStorage(new MemoryStorage(), () => {
  setAccountScope(ownerA.id);
  registerDevice(enrollment("revocable-device"), { user: ownerA });
  assert.equal(revokeDevice("revocable-device", ownerA).status, "revoked");
  clearDeviceRegistry();
  assert.equal(getDevice("revocable-device").status, "revoked");
  assert.equal(getDevice("revocable-device").trusted, false);

  assert.equal(unregisterDevice("revocable-device", ownerA), true);
  clearDeviceRegistry();
  assert.equal(getDevice("revocable-device"), null);
}));

test("corrupt, foreign-account, and invalid enrollment stores fail closed", () => withStorage(new MemoryStorage(), (storage) => {
  setAccountScope(ownerA.id);
  const key = getAccountStorageKey("hey_device_enrollments");
  storage.setItem(key, "not-json");
  assert.deepEqual(listDevices(), []);

  storage.setItem(key, JSON.stringify({ version: 1, accountId: ownerB.id, devices: [{ ...enrollment("foreign"), accountId: ownerB.id }] }));
  clearDeviceRegistry();
  assert.deepEqual(listDevices(), []);

  storage.setItem(key, JSON.stringify({ version: 1, accountId: ownerA.id, devices: [{ ...enrollment("invalid"), accountId: ownerA.id, platform: "unsupported" }] }));
  clearDeviceRegistry();
  assert.deepEqual(listDevices(), []);
}));

test("enrollment, revocation, and unregister fail safely when persistence is unavailable", () => withStorage(new MemoryStorage(), (storage) => {
  setAccountScope(ownerA.id);
  const originalSet = storage.setItem.bind(storage);
  storage.setItem = () => { throw new Error("quota"); };
  assert.throws(() => registerDevice(enrollment("failed-save"), { user: ownerA }), /safely saved/i);
  assert.equal(getDevice("failed-save"), null);

  storage.setItem = () => {};
  assert.throws(() => registerDevice(enrollment("readback-mismatch"), { user: ownerA }), /safely saved/i);
  assert.equal(getDevice("readback-mismatch"), null);

  storage.setItem = originalSet;
  registerDevice(enrollment("failed-revoke"), { user: ownerA });
  storage.setItem = () => { throw new Error("quota"); };
  const revoked = revokeDevice("failed-revoke", ownerA);
  assert.equal(revoked.status, "storage_failed");
  assert.equal(getDevice("failed-revoke").status, "offline");
  assert.equal(unregisterDevice("failed-revoke", ownerA), false);
  assert.equal(getDevice("failed-revoke").status, "offline");
}));
