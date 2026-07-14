import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Keyboard } from "@capacitor/keyboard";

/**
 * Tracks the native soft keyboard visibility (Android/iOS via the
 * Capacitor Keyboard plugin). Always returns `false` on the web, where
 * the plugin is not available.
 *
 * Used to hide fixed bottom UI (e.g. the TabBar) while the user is
 * typing, so it doesn't ride up above the keyboard and cover inputs.
 */
export function useKeyboardVisible() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let cancelled = false;
    const cleanups: Array<() => void> = [];

    (async () => {
      try {
        const show = await Keyboard.addListener("keyboardWillShow", () => {
          setVisible(true);
        });
        const hide = await Keyboard.addListener("keyboardWillHide", () => {
          setVisible(false);
        });
        if (cancelled) {
          show.remove();
          hide.remove();
          return;
        }
        cleanups.push(
          () => show.remove(),
          () => hide.remove(),
        );
      } catch {
        // Keyboard plugin unavailable (e.g. plugin not synced) — fail open.
      }
    })();

    return () => {
      cancelled = true;
      for (const c of cleanups) c();
    };
  }, []);

  return visible;
}
