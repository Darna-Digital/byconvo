//  @ts-check

import baseConfig from "@reviewer/lint/eslint"
import reactHooks from "eslint-plugin-react-hooks"

export default [
  ...baseConfig,
  {
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    ignores: ["eslint.config.js", "prettier.config.js", "src/routeTree.gen.ts"],
  },
]
