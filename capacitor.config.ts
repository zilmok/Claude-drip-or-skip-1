import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.driporskip.app",
  appName: "DripOrSkip",
  webDir: "dist-mobile",
  android: {
    // Historically documented fix for the Capacitor Android WebView bug
    // where typed text does not visually update the input until the
    // keyboard is dismissed. See https://capacitorjs.com/docs/config
    // (android.captureInput). Uses an alternative InputConnection.
    captureInput: true,
  },
  plugins: {
    Keyboard: {
      // Must stay false while @capawesome/capacitor-android-edge-to-edge-support
      // is installed, otherwise the WebView gets resized twice (once by
      // this plugin, once by the edge-to-edge plugin), producing broken
      // layouts when the keyboard opens.
      resizeOnFullScreen: false,
    },
    // Capacitor 8's built-in SystemBars insets handling is disabled in
    // favor of @capawesome/capacitor-android-edge-to-edge-support below,
    // which restores the app's traditional (non edge-to-edge) layout —
    // required because targetSdk 36 (Android 16) forces edge-to-edge with
    // no opt-out at the OS level, and this app's UI was not built to
    // handle raw system-bar/keyboard insets itself.
    SystemBars: {
      insetsHandling: "disable",
    },
    EdgeToEdge: {
      statusBarColor: "#000000",
      navigationBarColor: "#000000",
    },
  },
};

export default config;
