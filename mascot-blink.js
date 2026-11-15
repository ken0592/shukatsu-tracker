const CLOSE_SECONDS = 0.065;
const HOLD_SECONDS = 0.025;
const OPEN_SECONDS = 0.115;
const BLINK_SECONDS = CLOSE_SECONDS + HOLD_SECONDS + OPEN_SECONDS;

const clamp01 = value => Math.max(0, Math.min(1, value));
const smoothstep = value => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

/** Returns how closed the eyes are at an age in seconds after blink start. */
export function blinkAmountAt(ageSeconds) {
  if (!Number.isFinite(ageSeconds) || ageSeconds < 0 || ageSeconds >= BLINK_SECONDS) return 0;
  if (ageSeconds < CLOSE_SECONDS) return smoothstep(ageSeconds / CLOSE_SECONDS);
  if (ageSeconds < CLOSE_SECONDS + HOLD_SECONDS) return 1;
  return 1 - smoothstep((ageSeconds - CLOSE_SECONDS - HOLD_SECONDS) / OPEN_SECONDS);
}

const randomUnit = random => {
  const value = Number(random());
  return Number.isFinite(value) ? clamp01(value) : 0;
};

const nextInterval = random => 4 + randomUnit(random) * 3;

/**
 * Makes a deterministic, elapsed-time-based blink timeline.
 * sample() returns a 0..1 closed-eye amount; it has no wall-clock dependency.
 */
export function createBlinkTimeline(random = Math.random) {
  let nextPrimaryStart = nextInterval(random);
  let activeStart = -Infinity;
  let activeEnd = -Infinity;
  let doubleBlinkStart = null;

  const reset = (timeSeconds = 0) => {
    const now = Number.isFinite(timeSeconds) ? timeSeconds : 0;
    activeStart = -Infinity;
    activeEnd = -Infinity;
    doubleBlinkStart = null;
    nextPrimaryStart = now + nextInterval(random);
  };

  const sample = timeSeconds => {
    const now = Number.isFinite(timeSeconds) ? timeSeconds : 0;

    if (doubleBlinkStart !== null && now >= doubleBlinkStart) {
      if (now - doubleBlinkStart >= BLINK_SECONDS) {
        // A suspended tab may jump over the entire double blink. Resume with
        // one future blink instead of replaying missed events or catching up.
        doubleBlinkStart = null;
        activeStart = -Infinity;
        activeEnd = -Infinity;
        nextPrimaryStart = now + nextInterval(random);
      } else {
        activeStart = doubleBlinkStart;
        activeEnd = activeStart + BLINK_SECONDS;
        doubleBlinkStart = null;
        nextPrimaryStart = activeStart + nextInterval(random);
      }
    } else if (doubleBlinkStart === null && now >= nextPrimaryStart) {
      if (now - nextPrimaryStart >= BLINK_SECONDS) {
        // Skip a blink missed by a long frame/resume; consume only one interval.
        activeStart = -Infinity;
        activeEnd = -Infinity;
        nextPrimaryStart = now + nextInterval(random);
      } else {
        activeStart = nextPrimaryStart;
        activeEnd = activeStart + BLINK_SECONDS;
        if (randomUnit(random) < 0.16) {
          doubleBlinkStart = activeEnd + 0.28 + randomUnit(random) * 0.12;
          nextPrimaryStart = Infinity;
        } else {
          nextPrimaryStart = activeStart + nextInterval(random);
        }
      }
    }

    if (now < activeStart || now >= activeEnd) return 0;
    return blinkAmountAt(now - activeStart);
  };

  return { sample, reset };
}
