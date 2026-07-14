import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import type { UserConfig } from "vite";

// NOTE: `ssr: false` is kept from the original config (the web build is a
// client-only SPA). Vite's UserConfig type doesn't allow a boolean here,
// hence the cast — runtime behavior is identical to the original config,
// which passed this same object through untyped.
const viteConfig = {
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  ssr: false,
} as unknown as UserConfig;

export default defineConfig({ vite: viteConfig });
