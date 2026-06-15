/**
 * Shared Prettier config for reviewer.sh packages.
 *
 * Import and spread into a package's `prettier.config.js` to extend with
 * package-specific options (e.g. plugins):
 *
 *   import baseConfig from "@reviewer/lint/prettier"
 *   export default { ...baseConfig, plugins: ["prettier-plugin-tailwindcss"] }
 *
 * @type {import("prettier").Config}
 */
export default {
  endOfLine: "lf",
  semi: false,
  singleQuote: false,
  tabWidth: 2,
  trailingComma: "es5",
  printWidth: 80,
}
