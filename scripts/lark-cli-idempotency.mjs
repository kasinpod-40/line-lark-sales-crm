export function isNoOpMutationFailure(raw) {
  const text = typeof raw === "string" ? raw : JSON.stringify(raw || {});
  const lower = text.toLowerCase();
  return lower.includes("no operation produced") && lower.includes("did not change any persisted state");
}

function primitiveEqual(actual, expected) {
  if (typeof actual === "number" && typeof expected === "number") return Object.is(actual, expected);
  return actual === expected;
}

export function deepContains(actual, expected) {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) return false;
    return expected.every((item, index) => deepContains(actual[index], item));
  }
  if (expected && typeof expected === "object") {
    if (!actual || typeof actual !== "object" || Array.isArray(actual)) return false;
    return Object.entries(expected).every(([key, value]) => Object.prototype.hasOwnProperty.call(actual, key) && deepContains(actual[key], value));
  }
  return primitiveEqual(actual, expected);
}

function collectValues(value, out = []) {
  out.push(value);
  if (Array.isArray(value)) {
    for (const item of value) collectValues(item, out);
  } else if (value && typeof value === "object") {
    for (const child of Object.values(value)) collectValues(child, out);
  }
  return out;
}

export function viewPropertyMatches(payload, expected) {
  const unwrapValue = expected && typeof expected === "object" && !Array.isArray(expected) && Object.keys(expected).length === 1
    ? expected[Object.keys(expected)[0]]
    : undefined;

  for (const candidate of collectValues(payload)) {
    if (deepContains(candidate, expected)) return true;
    if (unwrapValue !== undefined && deepContains(candidate, unwrapValue)) return true;
  }
  return false;
}

function resolveFieldId(fieldIdsByName, fieldName) {
  const id = fieldIdsByName?.[fieldName];
  if (typeof id !== "string" || !id.trim()) throw new Error(`Missing Lark field id for ${fieldName}`);
  return id.trim();
}

export function readbackDesiredForViewProperty(property, desired, fieldIdsByName) {
  if (property === "visible_fields") {
    return {
      visible_fields: (desired.visible_fields || []).map((fieldName) => resolveFieldId(fieldIdsByName, fieldName)),
    };
  }
  if (property === "group") {
    return {
      group_config: (desired.group_config || []).map((item) => ({
        ...item,
        field: resolveFieldId(fieldIdsByName, item.field),
      })),
    };
  }
  if (property === "sort") {
    return {
      sort_config: (desired.sort_config || []).map((item) => ({
        ...item,
        field: resolveFieldId(fieldIdsByName, item.field),
      })),
    };
  }
  return desired;
}
