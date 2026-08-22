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

function fieldIdToNameMap(fieldIdsByName) {
  const reverse = new Map();
  for (const [name, id] of Object.entries(fieldIdsByName || {})) {
    if (typeof id === "string" && id.trim()) reverse.set(id.trim(), name);
  }
  return reverse;
}

export function canonicalizeViewFieldReferences(value, fieldIdsByName = {}) {
  const reverse = fieldIdToNameMap(fieldIdsByName);

  function visit(current) {
    if (typeof current === "string") return reverse.get(current) || current;
    if (Array.isArray(current)) return current.map(visit);
    if (current && typeof current === "object") {
      return Object.fromEntries(Object.entries(current).map(([key, child]) => [key, visit(child)]));
    }
    return current;
  }

  return visit(value);
}

export function viewPropertyMatches(payload, expected, fieldIdsByName = {}) {
  const canonicalPayload = canonicalizeViewFieldReferences(payload, fieldIdsByName);
  const canonicalExpected = canonicalizeViewFieldReferences(expected, fieldIdsByName);
  const unwrapValue = canonicalExpected && typeof canonicalExpected === "object" && !Array.isArray(canonicalExpected) && Object.keys(canonicalExpected).length === 1
    ? canonicalExpected[Object.keys(canonicalExpected)[0]]
    : undefined;

  for (const candidate of collectValues(canonicalPayload)) {
    if (deepContains(candidate, canonicalExpected)) return true;
    if (unwrapValue !== undefined && deepContains(candidate, unwrapValue)) return true;
  }
  return false;
}

function cloneViewPropertyDesired(property, desired) {
  if (property === "visible_fields") {
    return {
      visible_fields: [...(desired.visible_fields || [])],
    };
  }
  if (property === "group") {
    return {
      group_config: (desired.group_config || []).map((item) => ({ ...item })),
    };
  }
  if (property === "sort") {
    return {
      sort_config: (desired.sort_config || []).map((item) => ({ ...item })),
    };
  }
  return desired;
}

export function mutationDesiredForViewProperty(property, desired) {
  // The public current lark-cli help contract documents field *names* for
  // +view-set-visible-fields, +view-set-group and +view-set-sort, e.g.
  // {"visible_fields":["Name","Status"]},
  // {"group_config":[{"field":"Status","desc":false}]}, and
  // {"sort_config":[{"field":"Priority","desc":true}]}.
  //
  // The official CLI unit tests also accept fld... IDs, but the CLI E2E coverage
  // explicitly says View workflows do not have deterministic live coverage.
  // The golden Base live target has already shown getters returning canonical
  // field names, so use the documented name-based write contract and keep
  // concrete tbl.../vew... IDs only for resource addressing.
  return cloneViewPropertyDesired(property, desired);
}

export function readbackDesiredForViewProperty(property, desired) {
  // Live Lark CLI readback resolves view field references to canonical field names.
  // Keep expected state in the same stable contract-name form. The matcher still
  // canonicalizes alternate fld... ID-shaped readback if Lark returns it.
  return cloneViewPropertyDesired(property, desired);
}
