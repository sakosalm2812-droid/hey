const MAX_SCHEMA_DEPTH = 8;
const MAX_SCHEMA_PROPERTIES = 64;
const MAX_SCHEMA_ENUM = 32;
const MAX_DATA_DEPTH = 12;
const MAX_DATA_NODES = 512;
const MAX_DATA_TEXT = 64_000;
const SCHEMA_TYPES = new Set(["object", "array", "string", "number", "integer", "boolean", "null"]);

function plainRecord(value, _label) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function schemaRecord(input, depth, budget) {
  if (depth > MAX_SCHEMA_DEPTH || !plainRecord(input, "Tool schema")) throw new TypeError("Tool schema must be a bounded plain object.");
  const allowed = new Set([
    "type", "properties", "required", "items", "additionalProperties", "enum", "description",
    "minLength", "maxLength", "minimum", "maximum", "minItems", "maxItems",
  ]);
  const result = {};
  for (const key of Reflect.ownKeys(input)) {
    if (typeof key !== "string" || !allowed.has(key)) throw new TypeError("Tool schema contains an unsupported keyword.");
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError("Tool schema cannot contain accessors or hidden properties.");
    budget.properties += 1;
    if (budget.properties > MAX_SCHEMA_PROPERTIES) throw new TypeError("Tool schema contains too many properties.");
    result[key] = descriptor.value;
  }
  if (!SCHEMA_TYPES.has(result.type)) throw new TypeError("Tool schema type is unsupported.");
  if (result.description !== undefined && (typeof result.description !== "string" || result.description.length > 500)) {
    throw new TypeError("Tool schema description is invalid.");
  }

  for (const key of ["minLength", "maxLength", "minItems", "maxItems"]) {
    if (result[key] !== undefined && (!Number.isInteger(result[key]) || result[key] < 0 || result[key] > 100_000)) {
      throw new TypeError(`Tool schema ${key} is invalid.`);
    }
  }
  for (const key of ["minimum", "maximum"]) {
    if (result[key] !== undefined && (typeof result[key] !== "number" || !Number.isFinite(result[key]))) {
      throw new TypeError(`Tool schema ${key} is invalid.`);
    }
  }
  if (result.minLength !== undefined && result.maxLength !== undefined && result.minLength > result.maxLength) throw new TypeError("Tool schema string bounds are inconsistent.");
  if (result.minItems !== undefined && result.maxItems !== undefined && result.minItems > result.maxItems) throw new TypeError("Tool schema array bounds are inconsistent.");
  if (result.minimum !== undefined && result.maximum !== undefined && result.minimum > result.maximum) throw new TypeError("Tool schema numeric bounds are inconsistent.");

  if (result.type === "object") {
    const properties = result.properties ?? {};
    if (!plainRecord(properties, "Tool schema properties")) throw new TypeError("Tool schema properties must be a plain object.");
    const propertyNames = Reflect.ownKeys(properties);
    if (propertyNames.length > MAX_SCHEMA_PROPERTIES) throw new TypeError("Tool schema contains too many properties.");
    result.properties = {};
    for (const key of propertyNames) {
      if (typeof key !== "string" || ["__proto__", "constructor", "prototype"].includes(key) || key.length > 128) {
        throw new TypeError("Tool schema property name is invalid.");
      }
      const descriptor = Object.getOwnPropertyDescriptor(properties, key);
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError("Tool schema properties cannot contain accessors or hidden values.");
      result.properties[key] = schemaRecord(descriptor.value, depth + 1, budget);
    }
    const required = result.required ?? [];
    if (!Array.isArray(required) || required.length > MAX_SCHEMA_PROPERTIES || Object.getPrototypeOf(required) !== Array.prototype) {
      throw new TypeError("Tool schema required must be a bounded plain array.");
    }
    const requiredNames = [];
    for (let index = 0; index < required.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(required, String(index));
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value") || typeof descriptor.value !== "string") {
        throw new TypeError("Tool schema required cannot be sparse or contain non-string values.");
      }
      if (requiredNames.includes(descriptor.value) || !Object.hasOwn(result.properties, descriptor.value)) {
        throw new TypeError("Tool schema required names must be unique declared properties.");
      }
      requiredNames.push(descriptor.value);
    }
    result.required = requiredNames;
    if (result.additionalProperties !== undefined && typeof result.additionalProperties !== "boolean") {
      throw new TypeError("Tool schema additionalProperties must be a boolean.");
    }
    for (const key of ["items", "minItems", "maxItems", "minLength", "maxLength", "minimum", "maximum", "enum"]) {
      if (result[key] !== undefined) throw new TypeError(`Tool schema keyword ${key} does not apply to objects.`);
    }
  } else if (result.type === "array") {
    if (result.items === undefined) throw new TypeError("Tool array schema requires an items schema.");
    result.items = schemaRecord(result.items, depth + 1, budget);
    for (const key of ["properties", "required", "additionalProperties", "minLength", "maxLength", "minimum", "maximum"]) {
      if (result[key] !== undefined) throw new TypeError(`Tool schema keyword ${key} does not apply to arrays.`);
    }
    if (result.enum !== undefined) result.enum = normalizeEnum(result.enum);
  } else {
    for (const key of ["properties", "required", "items", "additionalProperties", "minItems", "maxItems"]) {
      if (result[key] !== undefined) throw new TypeError(`Tool schema keyword ${key} does not apply to ${result.type}.`);
    }
    if (result.enum !== undefined) result.enum = normalizeEnum(result.enum);
  }
  return result;
}

function normalizeEnum(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_SCHEMA_ENUM || Object.getPrototypeOf(value) !== Array.prototype) {
    throw new TypeError("Tool schema enum must be a non-empty bounded array.");
  }
  const values = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError("Tool schema enum cannot be sparse or contain accessors.");
    const entry = descriptor.value;
    if (entry !== null && !["string", "number", "boolean"].includes(typeof entry)) throw new TypeError("Tool schema enum values must be scalar.");
    if (typeof entry === "number" && !Number.isFinite(entry)) throw new TypeError("Tool schema enum values must be finite.");
    if (values.some((existing) => Object.is(existing, entry))) throw new TypeError("Tool schema enum values must be unique.");
    values.push(entry);
  }
  return values;
}

export function normalizeToolSchema(schema) {
  if (schema === undefined) return undefined;
  return schemaRecord(schema, 0, { properties: 0 });
}

export function snapshotToolData(value, label = "Tool data") {
  let budget = { nodes: 0, text: 0 };
  function clone(current, ancestors, depth) {
    if (current === null || typeof current === "boolean") return current;
    if (typeof current === "string") {
      budget.text += current.length;
      if (budget.text > MAX_DATA_TEXT) throw new TypeError(`${label} exceeds the text limit.`);
      return current;
    }
    if (typeof current === "number") {
      if (!Number.isFinite(current)) throw new TypeError(`${label} contains a non-finite number.`);
      return current;
    }
    if (typeof current !== "object") throw new TypeError(`${label} must contain only JSON-compatible values.`);
    if (depth >= MAX_DATA_DEPTH) throw new TypeError(`${label} exceeds the supported nesting depth.`);
    if (ancestors.has(current)) throw new TypeError(`${label} cannot contain cycles.`);
    const isArray = Array.isArray(current);
    const prototype = Object.getPrototypeOf(current);
    if (isArray ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(`${label} must contain only plain objects and arrays.`);
    }
    ancestors.add(current);
    const result = isArray ? [] : {};
    const keys = Reflect.ownKeys(current);
    if (keys.length > 128) throw new TypeError(`${label} contains too many properties.`);
    for (const key of keys) {
      if (isArray && key === "length") continue;
      if (typeof key !== "string" || (!isArray && ["__proto__", "constructor", "prototype"].includes(key))) {
        throw new TypeError(`${label} contains an unsupported property.`);
      }
      const descriptor = Object.getOwnPropertyDescriptor(current, key);
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError(`${label} cannot contain accessors or hidden properties.`);
      budget.nodes += 1;
      if (budget.nodes > MAX_DATA_NODES) throw new TypeError(`${label} contains too many values.`);
      if (isArray) {
        if (!/^(0|[1-9]\d*)$/u.test(key) || Number(key) >= current.length) throw new TypeError(`${label} arrays cannot contain custom properties.`);
        result.push(clone(descriptor.value, ancestors, depth + 1));
      } else {
        result[key] = clone(descriptor.value, ancestors, depth + 1);
      }
    }
    if (isArray && result.length !== current.length) throw new TypeError(`${label} arrays cannot be sparse.`);
    ancestors.delete(current);
    return result;
  }
  return clone(value, new WeakSet(), 0);
}

function schemaTypeMatches(value, type) {
  if (type === "null") return value === null;
  if (type === "array") return Array.isArray(value);
  if (type === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  if (type === "integer") return typeof value === "number" && Number.isInteger(value);
  return typeof value === type;
}

export function validateToolValue(value, schema, label = "Tool value") {
  if (!schemaTypeMatches(value, schema.type)) return `${label} must be ${schema.type}.`;
  if (schema.enum && !schema.enum.some((item) => Object.is(item, value))) return `${label} is outside the declared enum.`;
  if (schema.type === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) return `${label} is shorter than allowed.`;
    if (schema.maxLength !== undefined && value.length > schema.maxLength) return `${label} is longer than allowed.`;
    return null;
  }
  if (schema.type === "number" || schema.type === "integer") {
    if (schema.minimum !== undefined && value < schema.minimum) return `${label} is below the allowed minimum.`;
    if (schema.maximum !== undefined && value > schema.maximum) return `${label} is above the allowed maximum.`;
    return null;
  }
  if (schema.type === "array") {
    if (schema.minItems !== undefined && value.length < schema.minItems) return `${label} has too few items.`;
    if (schema.maxItems !== undefined && value.length > schema.maxItems) return `${label} has too many items.`;
    for (let index = 0; index < value.length; index += 1) {
      const error = validateToolValue(value[index], schema.items, `${label}[${index}]`);
      if (error) return error;
    }
    return null;
  }
  if (schema.type === "object") {
    for (const key of schema.required) if (!Object.hasOwn(value, key)) return `${label} is missing required field ${key}.`;
    if (schema.additionalProperties === false && Object.keys(value).some((key) => !Object.hasOwn(schema.properties, key))) {
      return `${label} contains an unsupported field.`;
    }
    for (const [key, childSchema] of Object.entries(schema.properties)) {
      if (!Object.hasOwn(value, key)) continue;
      const error = validateToolValue(value[key], childSchema, `${label}.${key}`);
      if (error) return error;
    }
  }
  return null;
}
