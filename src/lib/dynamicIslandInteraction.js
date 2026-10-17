const ALLOWED_INTERACTION_KEYS = new Set(["type", "target"]);

/** Returns an inert, detached interaction or null without invoking caller accessors. */
export function snapshotDynamicIslandInteraction(value) {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;

    const keys = Reflect.ownKeys(value);
    if (keys.length < 1 || keys.length > ALLOWED_INTERACTION_KEYS.size) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const snapshot = Object.create(null);
    for (const key of keys) {
      if (typeof key !== "string" || !ALLOWED_INTERACTION_KEYS.has(key)) return null;
      const descriptor = descriptors[key];
      if (!descriptor || !Object.hasOwn(descriptor, "value")) return null;
      snapshot[key] = descriptor.value;
    }

    if (snapshot.type !== "click") return null;
    if (Object.hasOwn(snapshot, "target") && snapshot.target !== "background") return null;
    return Object.freeze(Object.hasOwn(snapshot, "target")
      ? { type: "click", target: "background" }
      : { type: "click" });
  } catch {
    return null;
  }
}
