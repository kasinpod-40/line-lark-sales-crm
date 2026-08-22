export const DEFAULT_EVENTUAL_DELAYS_MS = Object.freeze([0, 500, 1000, 1500, 2500, 4000]);

export function reconcileIfNeeded({ read, matches, write }) {
  const before = read();
  if (matches(before)) {
    return { changed: 0, unchanged: 1, noOpRecovered: 0 };
  }

  const result = write();
  return {
    changed: result?.no_op === true ? 0 : 1,
    unchanged: 0,
    noOpRecovered: result?.no_op === true ? 1 : 0,
  };
}

export function verifyEventually({
  read,
  matches,
  delaysMs = DEFAULT_EVENTUAL_DELAYS_MS,
  sleep = () => {},
}) {
  let last;
  let attempts = 0;
  for (const delayMs of delaysMs) {
    if (delayMs > 0) sleep(delayMs);
    attempts += 1;
    last = read();
    if (matches(last)) {
      return { ok: true, attempts, last };
    }
  }
  return { ok: false, attempts, last };
}
