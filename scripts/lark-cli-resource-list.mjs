function getString(obj, keys) {
  for (const key of keys) {
    if (typeof obj?.[key] === "string" && obj[key].trim()) return obj[key].trim();
  }
  return "";
}

function findFirstCollection(payload, collectionKeys) {
  const queue = [payload];
  const seen = new Set();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== "object" || seen.has(current)) continue;
    seen.add(current);

    if (!Array.isArray(current)) {
      for (const key of collectionKeys) {
        if (Array.isArray(current[key])) return current[key];
      }
      for (const value of Object.values(current)) {
        if (value && typeof value === "object") queue.push(value);
      }
      continue;
    }

    for (const value of current) {
      if (value && typeof value === "object") queue.push(value);
    }
  }

  return null;
}

export function resourceMapFromList(payload, { collectionKeys, nameKeys, idKeys, label = "resource" }) {
  const items = findFirstCollection(payload, collectionKeys);
  if (!items) throw new Error(`Current Lark CLI ${label} list response did not contain ${collectionKeys.join("/")} array`);

  const map = new Map();
  for (const item of items) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const name = getString(item, nameKeys);
    const id = getString(item, idKeys);
    if (name && !map.has(name)) map.set(name, { id, raw: item });
  }
  return map;
}

export function resolveCanonicalNamedResource(resources, canonicalName, label = "resource") {
  if (!(resources instanceof Map)) throw new Error(`${label} resources must be a Map`);
  const canonical = String(canonicalName || "").trim();
  if (!canonical) throw new Error(`${label} canonical name cannot be blank`);

  const matches = [];
  for (const [displayName, meta] of resources.entries()) {
    const liveName = String(displayName || "").trim();
    // Golden Base presentation may prefix canonical table names with an emoji,
    // e.g. "👥 Customers". Keep the schema's canonical name stable while
    // resolving the exact live resource ID. A suffix match must be separated by
    // whitespace and is fail-closed if more than one live resource matches.
    if (liveName === canonical || liveName.endsWith(` ${canonical}`)) {
      matches.push({ displayName: liveName, id: String(meta?.id || "").trim(), raw: meta?.raw });
    }
  }

  if (matches.length !== 1) {
    const available = [...resources.keys()].map((name) => JSON.stringify(name)).join(", ");
    throw new Error(`Could not uniquely resolve ${label} ${canonical}; matches=${matches.length}; available=[${available}]`);
  }
  if (!matches[0].id) throw new Error(`${label} ${matches[0].displayName} resolved without a concrete id`);
  return matches[0];
}
