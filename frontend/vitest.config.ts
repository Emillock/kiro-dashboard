import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    // Engine/logic tests run on node by default. DOM-dependent component tests
    // opt into jsdom per-file via a `// @vitest-environment jsdom` docblock.
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
    },
  },
});
