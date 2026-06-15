import baseConfig from "@reviewer/lint/prettier"

/** @type {import("prettier").Config} */
export default {
  ...baseConfig,
  plugins: ["prettier-plugin-tailwindcss"],
  tailwindStylesheet: "src/styles.css",
  tailwindFunctions: ["cn", "cva"],
}
