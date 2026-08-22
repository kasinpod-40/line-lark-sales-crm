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
