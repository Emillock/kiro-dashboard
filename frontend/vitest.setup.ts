// Registers @testing-library/jest-dom custom matchers (e.g. toBeInTheDocument,
// toHaveAttribute) on Vitest's `expect`. Importing the matchers does not require a
// DOM, so this setup is safe for both node and jsdom test environments. Component
// tests opt into jsdom via a per-file `// @vitest-environment jsdom` docblock.
import "@testing-library/jest-dom/vitest";
