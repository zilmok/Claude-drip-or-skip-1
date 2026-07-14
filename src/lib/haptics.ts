// Lightweight haptic helper. No-op where unsupported (iOS Safari ignores).
export function hapticDrip() {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(10);
    }
  } catch {
    /* ignore */
  }
}

export function hapticSkip() {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate([10, 30, 10]);
    }
  } catch {
    /* ignore */
  }
}

export function hapticTap() {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(5);
    }
  } catch {
    /* ignore */
  }
}
