// @ts-check

import { tanstackConfig } from "@tanstack/eslint-config"

/**
 * Shared ESLint flat config for reviewer.sh packages.
 *
 * Spread this into a package's `eslint.config.js` and append any
 * package-specific overrides or `ignores` after it:
 *
 *   import baseConfig from "@reviewer/lint/eslint"
 *   export default [...baseConfig, { ignores: ["dist"] }]
 */
export default [
  ...tanstackConfig,
  {
    rules: {
      "import/no-cycle": "off",
      "import/order": "off",
      "sort-imports": "off",
      "@typescript-eslint/array-type": "off",
      "@typescript-eslint/require-await": "off",
      "pnpm/json-enforce-catalog": "off",

      // Relaxed so the same ruleset applies cleanly to both the React SPA and
      // the Effect backend. These conflict with idiomatic Effect code:
      // - precise Effect types make defensive guards look "unnecessary"
      // - Effect.gen generators legitimately may not `yield`
      // - Effect uses single-letter type params (A, E, R) rather than T-prefix
      "@typescript-eslint/no-unnecessary-condition": "off",
      "require-yield": "off",
      "@typescript-eslint/naming-convention": "off",
      // Stylistic; consistent with import/order and sort-imports being off.
      "import/consistent-type-specifier-style": "off",
    },
  },
]
