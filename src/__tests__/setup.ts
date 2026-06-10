// Vitest global setup.
//
// jest-dom registers DOM matchers (toBeInTheDocument, etc.) on Vitest's `expect`.
// Importing it here is safe for node-environment tests too — it only extends
// matchers and does not touch `document` until a DOM matcher is actually used,
// which only happens in jsdom-environment (hook/component) test files.
import '@testing-library/jest-dom/vitest';
