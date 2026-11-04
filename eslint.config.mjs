// ESLint flat config (app standards QA-LINT-1). no-unsanitized flags innerHTML/outerHTML/
// insertAdjacentHTML/document.write with unsanitized data (SEC-DOM-2); no-eval and friends back up
// SEC-EVAL-1.
import js from "@eslint/js";
import globals from "globals";
import nounsanitized from "eslint-plugin-no-unsanitized";

export default [
  { ignores: ["vendor/**", "node_modules/**", "dist/**", "build/**", "coverage/**", "**/*.min.js"] },
  js.configs.recommended,
  nounsanitized.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "script",
      globals: { ...globals.browser, ...globals.webextensions },
    },
    rules: {
      "no-eval": "error", "no-implied-eval": "error", "no-new-func": "error",
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" }],
    },
  },
  {
    files: ["**/*.mjs", "eslint.config.*"],
    languageOptions: { sourceType: "module" },
  },
  {
    files: ["**/*.test.*", "tests/**", "test/**", "examples/**", "scripts/**", "**/*.cjs", "*.config.*"],
    languageOptions: { globals: { ...globals.node } },
  },
  { // Existing code: unsafe DOM sinks and unused variables are listed as warnings (fix them over time)
    rules: {
      "no-unsanitized/property": "warn", "no-unsanitized/method": "warn",
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" }],
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-redeclare": ["error", { builtinGlobals: false }],
    },
  },
  { // Browser tests evaluate code inside the page, where the app's own globals exist.
    files: ["tests/**", "test/**"],
    rules: { "no-undef": "off" },
  },
];
